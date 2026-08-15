import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "JobFit - AI Job Application Copilot",
  description: "Instantly tailor your resume and cover letter for any job. Beat the ATS and land more interviews with our AI Chrome extension.",
  keywords: "resume builder, AI cover letter, ATS check, job search, LinkedIn, Indeed",
  openGraph: {
    title: "JobFit - AI Job Application Copilot",
    description: "Instantly tailor your resume and cover letter for any job. Beat the ATS and land more interviews.",
    type: "website",
    url: "https://jobfit.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "JobFit - AI Job Application Copilot",
    description: "Instantly tailor your resume and cover letter for any job.",
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "JobFit",
    "applicationCategory": "ProductivityApplication",
    "operatingSystem": "Chrome",
    "description": "An AI-powered Chrome extension that tailors resumes and cover letters for job postings on LinkedIn and Indeed.",
    "offers": {
      "@type": "Offer",
      "price": "12.00",
      "priceCurrency": "USD"
    }
  };

  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${inter.className} text-zinc-950`}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
