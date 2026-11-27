from pathlib import Path
from subprocess import CalledProcessError
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch

from fastapi import HTTPException

from app.routers.admin_control import _inspect_database_backup


VALID_MANIFEST = """; Archive created at 2026-11-25 12:00:00 UTC
;     Format: CUSTOM
;     Dump Version: 1.15-0
;
1; 1259 100 TABLE public users postgres
2; 1259 101 TABLE public orders postgres
3; 1259 102 TABLE public bills postgres
4; 1259 103 TABLE public payments postgres
5; 0 100 TABLE DATA public users postgres
"""


class BackupRestoreValidationTests(TestCase):
    @patch("app.routers.admin_control.subprocess.run")
    def test_inspection_accepts_custom_archive_with_required_tables(self, run):
        run.return_value = SimpleNamespace(stdout=VALID_MANIFEST)
        with TemporaryDirectory() as directory:
            backup = Path(directory) / "royal-skye.dump"
            backup.write_bytes(b"test")
            result = _inspect_database_backup(backup)

        self.assertEqual(result["archive_format"], "PostgreSQL custom")
        self.assertEqual(result["entry_count"], 5)
        self.assertEqual(result["table_count"], 4)
        self.assertIn("public.orders", result["tables"])
        run.assert_called_once()

    @patch("app.routers.admin_control.subprocess.run")
    def test_inspection_rejects_archive_missing_required_core_table(self, run):
        manifest = VALID_MANIFEST.replace(
            "4; 1259 103 TABLE public payments postgres\n", ""
        )
        run.return_value = SimpleNamespace(stdout=manifest)
        with TemporaryDirectory() as directory:
            backup = Path(directory) / "incomplete.dump"
            backup.write_bytes(b"test")
            with self.assertRaises(HTTPException) as raised:
                _inspect_database_backup(backup)

        self.assertEqual(raised.exception.status_code, 422)
        self.assertIn("public.payments", raised.exception.detail)

    @patch("app.routers.admin_control.subprocess.run")
    def test_inspection_rejects_non_custom_archive(self, run):
        run.return_value = SimpleNamespace(stdout=";     Format: TAR\n")
        with TemporaryDirectory() as directory:
            backup = Path(directory) / "wrong-format.dump"
            backup.write_bytes(b"test")
            with self.assertRaises(HTTPException) as raised:
                _inspect_database_backup(backup)

        self.assertEqual(raised.exception.status_code, 415)

    @patch("app.routers.admin_control.subprocess.run")
    def test_inspection_rejects_unreadable_archive(self, run):
        run.side_effect = CalledProcessError(1, ["pg_restore", "--list"])
        with TemporaryDirectory() as directory:
            backup = Path(directory) / "corrupt.dump"
            backup.write_bytes(b"not a postgres archive")
            with self.assertRaises(HTTPException) as raised:
                _inspect_database_backup(backup)

        self.assertEqual(raised.exception.status_code, 415)
