"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { Bell, BellOff, X } from "lucide-react";

export default function PushNotificationManager() {
  const { user, admin, token, adminToken } = useAuthStore();
  const [permission, setPermission] = useState<NotificationPermission | "default">("default");
  const [showPrompt, setShowPrompt] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [adminRegistered, setAdminRegistered] = useState(false);

  // Determine current session type
  const isUserSession = !!(user && token);
  const isAdminSession = !!(admin && adminToken);
  const isLoggedIn = isUserSession || isAdminSession;

  // Check notification permission on mount
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setPermission(Notification.permission);
  }, []);

  // Show prompt after login if notifications not yet enabled
  useEffect(() => {
    if (!isLoggedIn) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;

    const currentPermission = Notification.permission;
    setPermission(currentPermission);

    // If permission is default (not asked yet), show prompt after a delay
    if (currentPermission === "default") {
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 2000); // Show after 2 seconds
      return () => clearTimeout(timer);
    }

    // If already granted, make sure we're subscribed
    if (currentPermission === "granted") {
      if (isUserSession) {
        registerUserSubscription();
      }
      if (isAdminSession) {
        registerAdminSubscription();
      }
    }
  }, [user, admin, token, adminToken]);

  // Helper: Convert VAPID key from base64 to Uint8Array
  function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  const getSubscription = useCallback(async () => {
    const registration = await navigator.serviceWorker?.ready;
    if (!registration) {
      console.log("[Push] Service worker not ready");
      return null;
    }

    // Get VAPID public key
    const vapidResponse = await fetch("/api/push/vapid-key");
    const vapidData = await vapidResponse.json();
    if (!vapidData.success || !vapidData.publicKey) {
      console.error("[Push] Failed to get VAPID key");
      return null;
    }

    const applicationServerKey = urlBase64ToUint8Array(vapidData.publicKey);

    // Check if already subscribed
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // Subscribe to push
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }

    return subscription;
  }, []);

  const registerUserSubscription = useCallback(async () => {
    if (!user || !token || isRegistering || isRegistered) return;
    if (typeof window === "undefined") return;

    try {
      const subscription = await getSubscription();
      if (!subscription) return;

      // Send subscription to server
      setIsRegistering(true);
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: user.id,
          userType: "user",
          subscription: {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.getKey("p256dh")
                ? btoa(String.fromCharCode(...new Uint8Array(subscription.getKey("p256dh")!)))
                : "",
              auth: subscription.getKey("auth")
                ? btoa(String.fromCharCode(...new Uint8Array(subscription.getKey("auth")!)))
                : "",
            },
          },
        }),
      });

      const result = await response.json();
      if (result.success) {
        setIsRegistered(true);
        console.log("[Push] User subscription registered successfully");
      } else {
        console.error("[Push] Failed to register user subscription:", result.error);
      }
    } catch (error) {
      console.error("[Push] Error registering user subscription:", error);
    } finally {
      setIsRegistering(false);
    }
  }, [user, token, isRegistering, isRegistered, getSubscription]);

  const registerAdminSubscription = useCallback(async () => {
    if (!admin || !adminToken || isRegistering || adminRegistered) return;
    if (typeof window === "undefined") return;

    try {
      const subscription = await getSubscription();
      if (!subscription) return;

      // Send subscription to server as admin
      setIsRegistering(true);
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          userId: admin.id,
          userType: "admin",
          subscription: {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.getKey("p256dh")
                ? btoa(String.fromCharCode(...new Uint8Array(subscription.getKey("p256dh")!)))
                : "",
              auth: subscription.getKey("auth")
                ? btoa(String.fromCharCode(...new Uint8Array(subscription.getKey("auth")!)))
                : "",
            },
          },
        }),
      });

      const result = await response.json();
      if (result.success) {
        setAdminRegistered(true);
        console.log("[Push] Admin subscription registered successfully");
      } else {
        console.error("[Push] Failed to register admin subscription:", result.error);
      }
    } catch (error) {
      console.error("[Push] Error registering admin subscription:", error);
    } finally {
      setIsRegistering(false);
    }
  }, [admin, adminToken, isRegistering, adminRegistered, getSubscription]);

  const requestPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      setShowPrompt(false);

      if (result === "granted") {
        if (isUserSession) {
          await registerUserSubscription();
        }
        if (isAdminSession) {
          await registerAdminSubscription();
        }
      }
    } catch (error) {
      console.error("[Push] Error requesting permission:", error);
    }
  };

  const dismissPrompt = () => {
    setShowPrompt(false);
  };

  // Don't render anything if not logged in or notifications not supported
  if (!isLoggedIn) return null;
  if (typeof window !== "undefined" && !("Notification" in window)) return null;

  return (
    <>
      {/* Subtle prompt to enable notifications */}
      {showPrompt && permission === "default" && (
        <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="bg-[#1a1f2e] border border-[#2a3041] rounded-xl p-4 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                <Bell className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-white">Aktifkan Notifikasi</h4>
                <p className="text-xs text-gray-400 mt-0.5">
                  {isAdminSession
                    ? "Dapatkan notifikasi langsung di HP Anda untuk deposit, withdrawal, dan pendaftaran user baru."
                    : "Dapatkan notifikasi langsung di HP Anda untuk deposit, withdrawal, dan profit harian."}
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={requestPermission}
                    disabled={isRegistering}
                    className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isRegistering ? "Mengaktifkan..." : "Aktifkan"}
                  </button>
                  <button
                    onClick={dismissPrompt}
                    className="px-3 py-1.5 text-gray-400 hover:text-gray-300 text-xs transition-colors"
                  >
                    Nanti saja
                  </button>
                </div>
              </div>
              <button
                onClick={dismissPrompt}
                className="flex-shrink-0 text-gray-500 hover:text-gray-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Indicator when notifications are blocked */}
      {permission === "denied" && (
        <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:w-72 z-40">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-center gap-2">
            <BellOff className="w-4 h-4 text-red-400 flex-shrink-0" />
            <p className="text-[11px] text-red-300">
              Notifikasi diblokir. Aktifkan di pengaturan browser untuk mendapat update.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

