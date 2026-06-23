import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Login — NEXVO",
  description: "NEXVO Admin Panel",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
