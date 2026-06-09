import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "拾光知识库 - 私人知识仓库",
  description: "收集峰会演讲和公众号文章的私人知识库",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex bg-[#0a0a0a] text-gray-200">
        <Sidebar />
        <main className="flex-1 ml-56 p-6 overflow-auto min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
