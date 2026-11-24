import unittest
from datetime import datetime, timedelta

from app.routers.admin_control import _shift_covers_receipt


class CashShiftWindowTests(unittest.TestCase):
    def setUp(self):
        self.opened = datetime(2026, 11, 24, 9, 0, 0)
        self.closed = datetime(2026, 11, 24, 17, 0, 0)

    def test_receipt_at_opening_boundary_belongs_to_shift(self):
        self.assertTrue(_shift_covers_receipt(self.opened, self.opened, self.closed))

    def test_receipt_inside_shift_belongs_to_shift(self):
        self.assertTrue(_shift_covers_receipt(self.opened + timedelta(hours=2), self.opened, self.closed))

    def test_receipt_at_closing_boundary_belongs_to_shift(self):
        self.assertTrue(_shift_covers_receipt(self.closed, self.opened, self.closed))

    def test_receipt_before_shift_is_rejected(self):
        self.assertFalse(_shift_covers_receipt(self.opened - timedelta(microseconds=1), self.opened, self.closed))

    def test_receipt_after_shift_is_rejected(self):
        self.assertFalse(_shift_covers_receipt(self.closed + timedelta(microseconds=1), self.opened, self.closed))

    def test_open_shift_rejects_historical_receipts(self):
        self.assertFalse(_shift_covers_receipt(self.opened - timedelta(days=1), self.opened, None))
        self.assertTrue(_shift_covers_receipt(self.opened + timedelta(days=1), self.opened, None))


if __name__ == "__main__":
    unittest.main()
