"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuthStore } from "@/stores/auth-store";

export default function PushNotificationManager() {
  const { user, admin, token, adminToken } = useAuthStore();
  const [permission, setPermission] = useState<NotificationPermission | "default">("default");
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

    // If already granted, make sure we're subscribed (silent background subscription)
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

  // Don't render anything - background subscription only (silent, no floating UI)
  if (!isLoggedIn) return null;
  if (typeof window !== "undefined" && !("Notification" in window)) return null;

  return null;
}

