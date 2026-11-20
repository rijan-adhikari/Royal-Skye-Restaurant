import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login(username, password);
      navigate("/dashboard");
    } catch {
      setError("Invalid username or password");
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-brand-dark px-4 py-16">
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-xl p-8 w-full max-w-sm">
        <h1 className="text-xl font-semibold text-brand-dark mb-1">Royal Skye Birds</h1>
        <p className="text-sm text-neutral-500 mb-6">Restaurant & Bar Cafe - Staff Login</p>
        <label className="block text-sm font-medium mb-1">Username</label>
        <input
          className="w-full border rounded-lg px-3 py-2 mb-4"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
        />
        <label className="block text-sm font-medium mb-1">Password</label>
        <input
          type="password"
          className="w-full border rounded-lg px-3 py-2 mb-4"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <button className="w-full bg-brand hover:bg-brand-light text-white rounded-lg py-2 font-medium transition">
          Sign in
        </button>
      </form>
      <p className="absolute bottom-6 left-4 right-4 text-center text-xs text-white/55">
        Built by{" "}
        <a
          href="https://rijan-adhikari.onrender.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-white/80 transition hover:text-white hover:underline"
        >
          Rijan Adhikari
        </a>
      </p>
    </div>
  );
}
