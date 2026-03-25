/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import CryptoJS from 'crypto-js';
import { 
  Shield, 
  Plus, 
  Key, 
  Eye, 
  EyeOff, 
  Copy, 
  Trash2, 
  Wallet, 
  ExternalLink,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Globe,
  User
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from './constants';

// Types
interface PasswordEntry {
  website: string;
  username: string;
  encryptedPassword: string;
  timestamp: number;
  index: number;
}

export default function App() {
  // State
  const [account, setAccount] = useState<string | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [entries, setEntries] = useState<PasswordEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [masterPassword, setMasterPassword] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  
  // Form State
  const [newWebsite, setNewWebsite] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  // UI State
  const [revealedPasswords, setRevealedPasswords] = useState<Record<number, string>>({});
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Show notification
  const notify = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  // Connect Wallet
  const connectWallet = async () => {
    const ethereum = (window as any).ethereum;
    if (typeof ethereum !== 'undefined') {
      try {
        setLoading(true);
        const browserProvider = new ethers.BrowserProvider(ethereum);
        const accounts = await browserProvider.send("eth_requestAccounts", []);
        const signer = await browserProvider.getSigner();
        
        setAccount(accounts[0]);
        setProvider(browserProvider);
        
        if (CONTRACT_ADDRESS.toString() !== "0x0000000000000000000000000000000000000000") {
          const vaultContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
          setContract(vaultContract);
        } else {
          notify("Using Local Demo Mode (Contract not deployed)", "success");
          // Initialize demo data from localStorage
          const localData = localStorage.getItem('vaultx_demo_entries');
          if (localData) {
            setEntries(JSON.parse(localData));
          }
        }
      } catch (error: any) {
        console.error(error);
        notify("Failed to connect wallet", "error");
      } finally {
        setLoading(false);
      }
    } else {
      notify("Please install MetaMask", "error");
    }
  };

  // Fetch Entries
  const fetchEntries = useCallback(async () => {
    try {
      setLoading(true);
      
      // Check if we have a contract and provider
      if (!contract) {
        console.log("VaultX: No contract instance found. Checking Local Storage (Demo Mode).");
        const localData = localStorage.getItem('vaultx_demo_entries');
        if (localData) {
          const parsed = JSON.parse(localData);
          setEntries(parsed);
          console.log("VaultX: Loaded", parsed.length, "entries from Local Storage.");
        } else {
          setEntries([]);
        }
        return;
      }

      console.log("VaultX: Attempting to fetch entries from Blockchain...");
      console.log("VaultX: Contract Address:", CONTRACT_ADDRESS);
      
      // Get network info for debugging
      if (provider) {
        const network = await provider.getNetwork();
        console.log("VaultX: Connected to Network:", network.name, "(Chain ID:", network.chainId.toString(), ")");
      }

      const data = await contract.getEntries();
      console.log("VaultX: Raw data from contract:", data);

      if (!data || !Array.isArray(data)) {
        console.warn("VaultX: Received invalid data format from contract.");
        setEntries([]);
        return;
      }

      const formattedEntries: PasswordEntry[] = data.map((entry: any, index: number) => {
        // Ethers might return data as an array-like object with both keys and indices
        // We use positional fallback for maximum compatibility
        return {
          website: entry.website || entry[0] || "Unknown",
          username: entry.username || entry[1] || "Unknown",
          encryptedPassword: entry.encryptedPassword || entry[2] || "",
          timestamp: Number(entry.timestamp || entry[3] || 0),
          index: index
        };
      });
      
      setEntries(formattedEntries.reverse());
      console.log("VaultX: Successfully processed", formattedEntries.length, "blockchain entries.");
    } catch (error: any) {
      console.error("VaultX Fetch Error:", error);
      
      // If it's a "call revert" error, it might mean the contract isn't deployed on this network
      if (error.message?.includes("call revert") || error.code === "BAD_DATA") {
        notify("Contract call failed. Are you on the correct network?", "error");
      } else {
        notify("Failed to fetch entries. Check your connection.", "error");
      }
    } finally {
      setLoading(false);
    }
  }, [contract, provider, notify]);

  useEffect(() => {
    if (account) {
      fetchEntries();
    }
  }, [account, contract, fetchEntries]);

  // Add Entry
  const addEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!masterPassword) {
      notify("Enter a master password first", "error");
      return;
    }
    if (!newWebsite || !newUsername || !newPassword) {
      notify("All fields are required", "error");
      return;
    }

    try {
      setLoading(true);
      // Encrypt password client-side
      const encrypted = CryptoJS.AES.encrypt(newPassword, masterPassword).toString();
      
      if (contract) {
        // Fetch fee data to avoid 'transaction underpriced' errors on some networks
        let overrides: any = {};
        try {
          if (provider) {
            const feeData = await provider.getFeeData();
            // Ensure we have at least some gas fee
            overrides = {
              maxFeePerGas: feeData.maxFeePerGas,
              maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
            };
            
            // If the network reports 0 (common on some testnets/L2s), force a small value
            if (overrides.maxFeePerGas === 0n || overrides.maxFeePerGas === null) {
              delete overrides.maxFeePerGas;
              delete overrides.maxPriorityFeePerGas;
            }
          }
        } catch (feeError) {
          console.warn("Could not fetch fee data, proceeding with defaults:", feeError);
        }

        const tx = await contract.addEntry(newWebsite, newUsername, encrypted, overrides);
        notify("Transaction sent. Waiting for confirmation...");
        await tx.wait();
        notify("Password stored on blockchain!");
      } else {
        // Demo Mode: Store in localStorage
        const newEntry: PasswordEntry = {
          website: newWebsite,
          username: newUsername,
          encryptedPassword: encrypted,
          timestamp: Math.floor(Date.now() / 1000),
          index: entries.length
        };
        const updatedEntries = [newEntry, ...entries];
        setEntries(updatedEntries);
        localStorage.setItem('vaultx_demo_entries', JSON.stringify(updatedEntries));
        notify("Stored in Local Demo Mode!");
      }
      
      setNewWebsite('');
      setNewUsername('');
      setNewPassword('');
      if (contract) fetchEntries();
    } catch (error) {
      console.error(error);
      notify("Failed to store password", "error");
    } finally {
      setLoading(false);
    }
  };

  // Delete Entry
  const deleteEntry = async (index: number) => {
    try {
      setLoading(true);
      if (contract) {
        // Fetch fee data to avoid 'transaction underpriced' errors
        let overrides: any = {};
        try {
          if (provider) {
            const feeData = await provider.getFeeData();
            overrides = {
              maxFeePerGas: feeData.maxFeePerGas,
              maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
            };
            
            if (overrides.maxFeePerGas === 0n || overrides.maxFeePerGas === null) {
              delete overrides.maxFeePerGas;
              delete overrides.maxPriorityFeePerGas;
            }
          }
        } catch (feeError) {
          console.warn("Could not fetch fee data:", feeError);
        }

        const tx = await contract.deleteEntry(index, overrides);
        await tx.wait();
        notify("Entry deleted from blockchain");
        fetchEntries();
      } else {
        // Demo Mode
        const updatedEntries = entries.filter((_, i) => entries[i].index !== index);
        setEntries(updatedEntries);
        localStorage.setItem('vaultx_demo_entries', JSON.stringify(updatedEntries));
        notify("Deleted from Local Demo Mode");
      }
    } catch (error) {
      console.error(error);
      notify("Failed to delete entry", "error");
    } finally {
      setLoading(false);
    }
  };

  // Reveal Password
  const revealPassword = (index: number, encrypted: string) => {
    if (!isUnlocked || !masterPassword) {
      notify("Please unlock your vault with your Master Password first.", "error");
      return;
    }
    try {
      const bytes = CryptoJS.AES.decrypt(encrypted, masterPassword);
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      
      if (!decrypted || decrypted.length === 0) {
        throw new Error("Decryption resulted in empty string");
      }
      
      setRevealedPasswords(prev => ({ ...prev, [index]: decrypted }));
      notify("Password decrypted successfully!");
      
      // Hide after 5 seconds
      setTimeout(() => {
        setRevealedPasswords(prev => {
          const newState = { ...prev };
          delete newState[index];
          return newState;
        });
      }, 5000);
    } catch (error) {
      console.error("Decryption Error:", error);
      notify("Decryption failed! Is your Master Password correct?", "error");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    notify("Copied to clipboard!");
  };

  const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <div className="min-h-screen bg-background text-white p-4 md:p-8">
      {/* Navbar */}
      <nav className="max-w-7xl mx-auto flex justify-between items-center mb-12">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-accent/10 rounded-lg border border-accent/20">
            <Shield className="w-8 h-8 text-accent neon-glow" />
          </div>
          <h1 className="text-2xl font-bold tracking-tighter neon-text">VaultX</h1>
        </div>
        
        {account ? (
          <div className="flex items-center gap-3 px-4 py-2 glass rounded-full">
            <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
            <span className="text-sm font-mono text-white/70">{shortenAddress(account)}</span>
          </div>
        ) : (
          <button 
            onClick={connectWallet}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 bg-accent text-black font-semibold rounded-full hover:bg-accent-hover transition-all active:scale-95 disabled:opacity-50"
          >
            <Wallet className="w-4 h-4" />
            Connect Wallet
          </button>
        )}
      </nav>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Controls & Add */}
        <div className="lg:col-span-4 space-y-6">
          {/* Master Password Section */}
          <section className="glass p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Key className="w-5 h-5 text-accent" />
                Vault Access
              </h2>
              {isUnlocked ? (
                <Unlock className="w-5 h-5 text-accent" />
              ) : (
                <Lock className="w-5 h-5 text-white/30" />
              )}
            </div>
            
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest text-white/40 font-bold">Master Password</label>
              <div className="relative">
                <input 
                  type="password"
                  value={masterPassword}
                  onChange={(e) => setMasterPassword(e.target.value)}
                  placeholder="Enter decryption key..."
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-accent/50 transition-colors"
                />
              </div>
            </div>

            <button 
              onClick={() => {
                if (isUnlocked) {
                  setMasterPassword('');
                  setRevealedPasswords({});
                  notify("Vault locked and session cleared.");
                }
                setIsUnlocked(!isUnlocked);
              }}
              className={cn(
                "w-full py-3 rounded-xl font-bold transition-all active:scale-95",
                isUnlocked 
                  ? "bg-white/5 text-white border border-white/10 hover:bg-white/10" 
                  : "bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20"
              )}
            >
              {isUnlocked ? "Lock Vault" : "Unlock Vault"}
            </button>

            {!isUnlocked && (
              <div className="flex gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0" />
                <p className="text-xs text-yellow-500/80 leading-relaxed">
                  Encryption is client-side. If you lose this password, your data cannot be recovered.
                </p>
              </div>
            )}
          </section>

          {/* Add Password Form */}
          <section className={cn("glass p-6 space-y-6 transition-opacity", !isUnlocked && "opacity-50 pointer-events-none")}>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Plus className="w-5 h-5 text-accent" />
              Add New Entry
            </h2>

            <form onSubmit={addEntry} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest text-white/40 font-bold">Website / App</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <input 
                    type="text"
                    value={newWebsite}
                    onChange={(e) => setNewWebsite(e.target.value)}
                    placeholder="e.g. Google, Binance"
                    className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-accent/50 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest text-white/40 font-bold">Username / Email</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <input 
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="username@example.com"
                    className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-accent/50 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest text-white/40 font-bold">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <input 
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-accent/50 transition-colors"
                  />
                </div>
              </div>

              <button 
                type="submit"
                disabled={loading || !account}
                className="w-full py-4 bg-accent text-black font-bold rounded-xl hover:bg-accent-hover transition-all active:scale-95 disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Secure on Blockchain"}
              </button>
            </form>
          </section>
        </div>

        {/* Right Column: Entries List */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold flex items-center gap-3">
              Stored Passwords
              <span className="px-2 py-0.5 bg-white/5 rounded text-sm text-white/40">{entries.length}</span>
            </h2>
            <button 
              onClick={fetchEntries}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors text-white/40 hover:text-white"
            >
              <Loader2 className={cn("w-5 h-5", loading && "animate-spin")} />
            </button>
          </div>

          {!account ? (
            <div className="glass h-64 flex flex-col items-center justify-center text-center p-8 space-y-4">
              <div className="p-4 bg-white/5 rounded-full">
                <Wallet className="w-12 h-12 text-white/20" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Wallet Not Connected</h3>
                <p className="text-white/40 max-w-xs">Connect your MetaMask wallet to view and manage your decentralized vault.</p>
              </div>
            </div>
          ) : entries.length === 0 ? (
            <div className="glass h-64 flex flex-col items-center justify-center text-center p-8 space-y-4">
              <div className="p-4 bg-white/5 rounded-full">
                <Shield className="w-12 h-12 text-white/20" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">No Entries Found</h3>
                <p className="text-white/40 max-w-xs mx-auto">
                  Your vault is empty on this network. 
                  {contract ? " Make sure you are on the correct blockchain network where you stored your passwords." : " Add your first password using the form on the left."}
                </p>
                {contract && (
                  <p className="text-xs text-accent/50 mt-2">
                    Connected to: {CONTRACT_ADDRESS.slice(0, 6)}...{CONTRACT_ADDRESS.slice(-4)}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AnimatePresence>
                {entries.map((entry) => (
                  <motion.div 
                    key={entry.timestamp}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="glass p-5 glass-hover group"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-accent/10 rounded-xl flex items-center justify-center border border-accent/20">
                          <Globe className="w-5 h-5 text-accent" />
                        </div>
                        <div>
                          <h3 className="font-bold text-lg leading-tight">{entry.website}</h3>
                          <p className="text-xs text-white/40">{new Date(entry.timestamp * 1000).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => deleteEntry(entry.index)}
                        className="p-2 text-white/20 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-black/40 rounded-xl border border-white/5">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <User className="w-4 h-4 text-white/30 shrink-0" />
                          <span className="text-sm text-white/70 truncate">{entry.username}</span>
                        </div>
                        <button 
                          onClick={() => copyToClipboard(entry.username)}
                          className="p-1.5 hover:bg-white/10 rounded transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5 text-white/40" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-black/40 rounded-xl border border-white/5">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <Lock className="w-4 h-4 text-white/30 shrink-0" />
                          <span className={cn(
                            "text-sm font-mono tracking-wider truncate",
                            revealedPasswords[entry.index] ? "text-accent" : "text-white/20"
                          )}>
                            {revealedPasswords[entry.index] || "••••••••••••"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {revealedPasswords[entry.index] && (
                            <button 
                              onClick={() => copyToClipboard(revealedPasswords[entry.index])}
                              className="p-1.5 hover:bg-white/10 rounded transition-colors"
                            >
                              <Copy className="w-3.5 h-3.5 text-white/40" />
                            </button>
                          )}
                          <button 
                            onClick={() => revealPassword(entry.index, entry.encryptedPassword)}
                            className="p-1.5 hover:bg-white/10 rounded transition-colors"
                          >
                            {revealedPasswords[entry.index] ? (
                              <EyeOff className="w-3.5 h-3.5 text-accent" />
                            ) : (
                              <Eye className="w-3.5 h-3.5 text-white/40" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>

      {/* Notifications */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-8 right-8 z-50"
          >
            <div className={cn(
              "flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border backdrop-blur-xl",
              notification.type === 'success' 
                ? "bg-green-500/10 border-green-500/20 text-green-500" 
                : "bg-red-500/10 border-red-500/20 text-red-500"
            )}>
              {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
              <span className="font-semibold">{notification.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Info */}
      <footer className="max-w-7xl mx-auto mt-20 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-white/30 text-sm">
        <p>© 2026 VaultX Lite • Decentralized & Encrypted</p>
        <div className="flex items-center gap-6">
          <a href="#" className="hover:text-accent transition-colors flex items-center gap-1">
            Smart Contract <ExternalLink className="w-3 h-3" />
          </a>
          <a href="#" className="hover:text-accent transition-colors flex items-center gap-1">
            Security Audit <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </footer>
    </div>
  );
}
