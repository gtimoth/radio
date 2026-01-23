import React, { FC, useState } from "react";
import { useNavigate } from "react-router-dom";

export const LoginPage: FC = () => {
  const radio = window.radio;
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const success = await radio.loginAsZod(password);
      if (success) {
        navigate("/");
        window.location.reload();
      } else {
        setError("Invalid password");
      }
    } catch (_err) {
      setError("Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-xs">
        <h1 className="text-2xl font-bold mb-6 text-center">Login as ~zod</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full border border-black p-2"
              disabled={loading}
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full border border-black p-2 hover:bg-gray-100 disabled:opacity-50"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
};
