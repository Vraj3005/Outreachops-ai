"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Mail, Lock, User, ArrowRight, UserPlus, LogIn } from "lucide-react";
import { useToast } from "@/components/Toast";
import { supabase } from "@/lib/supabase";

export default function AuthPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("vraj@pitbullcorporations.com");
  const [password, setPassword] = useState("password123");
  const [name, setName] = useState("Vraj");
  const [loading, setLoading] = useState(false);
  const [isLocalMode, setIsLocalMode] = useState(true);

  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    // Check if Supabase client is active
    if (supabase) {
      setIsLocalMode(false);
      // If user is already logged in, redirect to dashboard
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          router.push("/dashboard");
        }
      });
    } else {
      setIsLocalMode(true);
    }
  }, [router]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast("Email and Password are required", "error");
      return;
    }

    setLoading(true);

    if (isLocalMode || !supabase) {
      // Local Mock Mode Simulation
      setTimeout(() => {
        setLoading(false);
        toast(
          isSignUp 
            ? "Account created (Demo Mode - Saved locally)" 
            : "Authenticated successfully (Demo Mode)"
        );
        router.push("/dashboard");
      }, 1000);
      return;
    }

    try {
      if (isSignUp) {
        // Sign Up with Supabase
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
            },
          },
        });

        if (error) {
          toast(error.message, "error");
        } else {
          toast("Registration successful! Check your email for confirmation link.");
          setIsSignUp(false);
        }
      } else {
        // Sign In with Supabase
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          toast(error.message, "error");
        } else {
          toast("Access authorized successfully");
          router.push("/dashboard");
        }
      }
    } catch (err: any) {
      console.error(err);
      toast("Auth connection error", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-6 py-12 relative overflow-hidden font-sans">
      {/* Background radial highlight */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/[0.04] rounded-full blur-3xl -z-10"></div>

      <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-zinc-200 space-y-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] transition-all">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-10 h-10 rounded-xl bg-zinc-950 items-center justify-center shadow-md mb-2">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-bold text-zinc-900 tracking-tight">
            {isSignUp ? "Create an account" : "Welcome back"}
          </h2>
          <p className="text-xs text-zinc-500">
            {isSignUp 
              ? "Sign up to start personalize outreach campaigns" 
              : "Log in to manage your B2B personalization campaigns"}
          </p>
        </div>

        {/* Local Demo Pill */}
        {isLocalMode && (
          <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-100 text-[10px] text-amber-800 font-semibold text-center leading-relaxed">
            ⚠️ Supabase environment keys not detected. Running in <strong>Local Demo Mode</strong>. 
            Any credentials will bypass and sign in instantly.
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          {isSignUp && (
            <div className="space-y-1 animate-fade-in">
              <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block mb-1">Full Name</label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 focus:ring-1 focus:ring-zinc-950 transition-all font-medium placeholder-zinc-400"
                  required
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block mb-1">Email address</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@agency.com"
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 focus:ring-1 focus:ring-zinc-950 transition-all font-medium placeholder-zinc-400"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block">Password</label>
              {!isSignUp && <a href="#" className="text-[10px] text-zinc-500 hover:text-zinc-950 transition-colors">Forgot password?</a>}
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-zinc-950 focus:ring-1 focus:ring-zinc-950 transition-all font-medium placeholder-zinc-400"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-zinc-950 hover:bg-zinc-800 disabled:opacity-50 text-white font-semibold text-xs rounded-lg transition-all flex items-center justify-center gap-2 mt-6 shadow-md"
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>{isSignUp ? "Create Account" : "Sign In"}</span>
                {isSignUp ? <UserPlus className="w-3.5 h-3.5" /> : <LogIn className="w-3.5 h-3.5" />}
              </>
            )}
          </button>
        </form>

        {/* Toggle */}
        <div className="text-center pt-2 border-t border-zinc-100">
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-xs text-zinc-500 hover:text-zinc-950 transition-colors font-semibold"
          >
            {isSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
          </button>
        </div>

        <div className="text-center">
          <span className="text-[9px] text-zinc-400">
            Secure client authentication powered by <span className="text-zinc-600 font-semibold">Supabase Auth</span>
          </span>
        </div>
      </div>
    </div>
  );
}
