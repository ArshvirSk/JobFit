"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { FileText, Mail, Target, MessageSquare, Cpu, Kanban } from "lucide-react";
import "./landing.css";
/* ─────────────────────────────────────────────
   DATA
   ───────────────────────────────────────────── */

const FEATURES = [
  {
    icon: FileText,
    title: "Resume Tailoring",
    desc: "Rewrites your bullet points to mirror job description language and prioritize relevant experience — without fabricating anything.",
  },
  {
    icon: Mail,
    title: "Cover Letter Generation",
    desc: "Role-specific cover letters in your voice. Toggle between casual and formal. Never copy-paste the same letter again.",
  },
  {
    icon: Target,
    title: "Skill-Gap Analysis",
    desc: "Identifies 2-4 skills the JD demands that your resume doesn't cover, with actionable fix suggestions.",
  },
  {
    icon: MessageSquare,
    title: "Interview Questions",
    desc: "8-10 likely questions based on the specific JD and role type — not generic 'tell me about yourself' lists.",
  },
  {
    icon: Cpu,
    title: "ATS Compatibility",
    desc: "Flags formatting issues — tables, images, non-standard fonts — that silently break ATS parsing.",
  },
  {
    icon: Kanban,
    title: "Application Tracker",
    desc: "Track every application with the tailored resume and letter attached. Your entire job search in one place.",
  },
];

const FAQS = [
  {
    q: "How does JobFit tailor my resume?",
    a: "JobFit parses the job description to extract required skills, seniority signals, and keywords. It then rewrites your resume's bullet points to mirror that language — prioritizing relevant experience without adding anything you haven't done.",
  },
  {
    q: "Does it fabricate experience or skills?",
    a: "Never. JobFit only works with what's already on your resume. It rephrases and reorders to highlight relevance, but it will never invent accomplishments or skills you don't have.",
  },
  {
    q: "What job boards does the Chrome extension work on?",
    a: "Currently LinkedIn and Indeed. When you open a job posting, the extension automatically detects the JD and lets you tailor with one click.",
  },
  {
    q: "What's included in the free tier?",
    a: "3 tailored applications per month, including resume tailoring, cover letter generation, and skill-gap analysis. Interview questions and ATS checks are Pro-only features.",
  },
  {
    q: "Can I cancel my Pro subscription anytime?",
    a: "Yes. Cancel anytime from your dashboard. You'll keep Pro access through the end of your billing period.",
  },
  {
    q: "What file formats are supported?",
    a: "Upload your base resume as PDF or DOCX. Tailored outputs can be exported as PDF, ready to submit.",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "I was applying to 15+ jobs a week with the same generic resume. JobFit let me tailor each one in under a minute. I landed 3 interviews in my first week.",
    name: "Sarah Chen",
    role: "Software Engineer",
    company: "Previously job searching",
  },
  {
    quote:
      "The skill-gap analysis alone is worth it. It showed me exactly which keywords I was missing and how to phrase my existing experience to match. Game changer.",
    name: "Marcus Rivera",
    role: "Product Manager",
    company: "Career switcher",
  },
  {
    quote:
      "I used to spend 20 minutes per application tailoring my resume. Now I spend 30 seconds. The quality is better than what I was doing manually.",
    name: "Priya Patel",
    role: "Data Analyst",
    company: "Recent graduate",
  },
];

/* ─────────────────────────────────────────────
   HERO PARTICLE CANVAS
   ───────────────────────────────────────────── */

function useParticleCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let mouse = { x: -1000, y: -1000 };

    let particles: {
      x: number;
      y: number;
      targetX: number;
      targetY: number;
      vx: number;
      vy: number;
      size: number;
      alpha: number;
    }[] = [];

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    const createDocumentShape = (w: number, h: number) => {
      const points: { x: number; y: number }[] = [];
      const docW = w * 0.45;
      const docH = h * 0.65;
      const startX = (w - docW) / 2;
      const startY = (h - docH) / 2;

      // Document outline
      for (let i = 0; i < 60; i++) {
        const t = i / 60;
        const perim = 2 * (docW + docH);
        const d = t * perim;
        let px: number, py: number;
        if (d < docW) {
          px = startX + d;
          py = startY;
        } else if (d < docW + docH) {
          px = startX + docW;
          py = startY + (d - docW);
        } else if (d < 2 * docW + docH) {
          px = startX + docW - (d - docW - docH);
          py = startY + docH;
        } else {
          px = startX;
          py = startY + docH - (d - 2 * docW - docH);
        }
        points.push({ x: px, y: py });
      }

      // Content lines inside document
      const lineSpacing = docH / 10;
      for (let row = 1; row <= 8; row++) {
        const lineW = row <= 2 ? docW * 0.7 : row === 3 ? docW * 0.5 : docW * (0.5 + Math.random() * 0.35);
        const numDots = Math.floor(lineW / 12);
        for (let j = 0; j < numDots; j++) {
          points.push({
            x: startX + 20 + (j / numDots) * lineW,
            y: startY + row * lineSpacing,
          });
        }
      }

      return points;
    };

    const init = () => {
      resize();
      const rect = canvas.getBoundingClientRect();
      const docPoints = createDocumentShape(rect.width, rect.height);
      particles = docPoints.map((p) => ({
        x: Math.random() * rect.width,
        y: Math.random() * rect.height,
        targetX: p.x,
        targetY: p.y,
        vx: 0,
        vy: 0,
        size: 1.5 + Math.random() * 1,
        alpha: 0.3 + Math.random() * 0.5,
      }));
    };

    const animate = () => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      for (const p of particles) {
        // Mouse interaction
        const mdx = mouse.x - p.x;
        const mdy = mouse.y - p.y;
        const mDist = Math.sqrt(mdx * mdx + mdy * mdy);
        const maxDist = 120 * (window.devicePixelRatio || 1);

        if (mDist < maxDist && mDist > 0) {
          const force = (maxDist - mDist) / maxDist;
          p.vx -= (mdx / mDist) * force * 1.5;
          p.vy -= (mdy / mDist) * force * 1.5;
        }

        // Return to target
        const dx = p.targetX - p.x;
        const dy = p.targetY - p.y;
        p.vx += dx * 0.015;
        p.vy += dy * 0.015;
        
        // Friction and velocity application
        p.vx *= 0.92;
        p.vy *= 0.92;
        p.x += p.vx;
        p.y += p.vy;

        // Slight float
        p.y += Math.sin(Date.now() * 0.001 + p.x * 0.01) * 0.15;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(59, 130, 246, ${p.alpha})`;
        ctx.fill();
      }

      animId = requestAnimationFrame(animate);
    };

    init();
    animate();

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      mouse.x = (e.clientX - rect.left) * dpr;
      mouse.y = (e.clientY - rect.top) * dpr;
    };

    const handleMouseLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };

    window.addEventListener("resize", () => init());
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", () => init());
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [canvasRef]);
}

/* ─────────────────────────────────────────────
   SCROLL OBSERVER HOOK
   ───────────────────────────────────────────── */

function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.12 }
    );

    document.querySelectorAll(".fade-section").forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);
}

/* ─────────────────────────────────────────────
   COUNTER ANIMATION HOOK
   ───────────────────────────────────────────── */

function useCountUp(targetVal: number, duration: number = 2000) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          const start = performance.now();
          const tick = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setVal(Math.floor(eased * targetVal));
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [targetVal, duration]);

  return { val, ref };
}

/* ─────────────────────────────────────────────
   MAIN COMPONENT
   ───────────────────────────────────────────── */

export default function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useParticleCanvas(canvasRef);
  useScrollReveal();

  // Sticky nav
  const [navHidden, setNavHidden] = useState(false);
  const [navScrolled, setNavScrolled] = useState(false);
  const lastScroll = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY;
      setNavHidden(y > 120 && y > lastScroll.current);
      setNavScrolled(y > 60);
      lastScroll.current = y;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // FAQ state
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Pricing toggle
  const [annual, setAnnual] = useState(true);

  // Counters
  const counter1 = useCountUp(12000);
  const counter2 = useCountUp(89);
  const counter3 = useCountUp(30);

  // Demo slider
  const [demoTab, setDemoTab] = useState<"before" | "after">("before");

  return (
    <div className="overflow-x-hidden">
      {/* ─── NAVIGATION ─── */}
      <nav
        className={`nav-landing ${navHidden ? "nav-hidden" : ""} ${
          navScrolled ? "nav-scrolled" : ""
        }`}
      >
        <div className="max-w-[1400px] mx-auto flex items-center justify-between px-8 py-4">
          <Link
            href="/"
            className="text-white font-bold text-xl tracking-tight"
          >
            JobFit
          </Link>

          <div className="hidden md:flex items-center gap-8">
            {["Features", "How it Works", "Pricing", "FAQ"].map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase().replace(/\s+/g, "-")}`}
                className="label-mono text-white/70 hover:text-white transition-colors duration-300"
              >
                {item}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="label-mono text-white/70 hover:text-white transition-colors duration-300 hidden sm:block"
            >
              Sign In
            </Link>
            <Link href="/login" className="btn-pill btn-pill-primary text-xs">
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section className="section-dark relative min-h-screen flex items-center overflow-hidden">
        <canvas ref={canvasRef} className="hero-canvas" />

        <div className="relative z-10 max-w-[1400px] mx-auto px-8 py-32 w-full">
          <div className="max-w-2xl">
            <p className="label-mono text-blue-400 mb-6">
              AI-Powered Resume Tailoring
            </p>

            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.05] mb-8">
              Your resume,
              <br />
              tailored to{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-blue-600">
                every job
              </span>
              <br />
              in 30 seconds
            </h1>

            <p className="text-lg md:text-xl text-white/60 max-w-lg mb-10 leading-relaxed">
              Paste a job link. Get a tailored resume, cover letter, skill-gap
              list, and likely interview questions — without leaving the job
              posting.
            </p>

            <div className="flex flex-wrap gap-4">
              <Link href="/login" className="btn-pill btn-pill-primary">
                Install Free Extension
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  className="ml-1"
                >
                  <path
                    d="M1 7h12M8 2l5 5-5 5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
              <a href="#how-it-works" className="btn-pill btn-pill-outline">
                See How It Works
              </a>
            </div>
          </div>
        </div>

        {/* Bottom gradient fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
      </section>

      {/* ─── SOCIAL PROOF TICKER ─── */}
      <section className="section-dark border-t border-white/[0.06] py-6 overflow-hidden">
        <div className="flex animate-marquee w-max">
          {[...Array(6)].map((_, dupeIdx) => (
            <div
              key={dupeIdx}
              className="flex items-center gap-12 px-6 shrink-0"
            >
              <span className="label-mono text-white/50 flex items-center gap-3">
                <span
                  className="text-2xl font-bold text-white"
                  ref={dupeIdx === 0 ? counter1.ref : undefined}
                >
                  {dupeIdx === 0
                    ? counter1.val.toLocaleString() + "+"
                    : "12,000+"}
                </span>
                Resumes Tailored
              </span>
              <span className="text-white/20">·</span>
              <span className="label-mono text-white/50 flex items-center gap-3">
                <span className="text-2xl font-bold text-white">4.9 ★</span>
                Chrome Web Store
              </span>
              <span className="text-white/20">·</span>
              <span className="label-mono text-white/50 flex items-center gap-3">
                <span
                  className="text-2xl font-bold text-white"
                  ref={dupeIdx === 0 ? counter2.ref : undefined}
                >
                  {dupeIdx === 0 ? counter2.val + "%" : "89%"}
                </span>
                Interview Rate Increase
              </span>
              <span className="text-white/20">·</span>
              <span className="label-mono text-white/50 flex items-center gap-3">
                <span
                  className="text-2xl font-bold text-white"
                  ref={dupeIdx === 0 ? counter3.ref : undefined}
                >
                  {dupeIdx === 0 ? counter3.val + "s" : "30s"}
                </span>
                Average Tailor Time
              </span>
              <span className="text-white/20">·</span>
            </div>
          ))}
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section
        id="how-it-works"
        className="section-light py-32 px-8"
      >
        <div className="max-w-[1400px] mx-auto">
          <div className="fade-section mb-20">
            <p className="label-mono text-zinc-400 mb-4">How It Works</p>
            <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-tight">
              Three steps.
              <br />
              <span className="text-zinc-400">Thirty seconds.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 md:gap-12">
            {[
              {
                step: "01",
                title: "Upload your resume",
                desc: "Upload once as PDF or DOCX. We parse and store it securely. No re-uploading needed.",
              },
              {
                step: "02",
                title: "Open a job posting",
                desc: "Browse LinkedIn or Indeed normally. Our extension detects the JD automatically — or paste a URL.",
              },
              {
                step: "03",
                title: "Get tailored results",
                desc: "Tailored resume, cover letter, skill gaps, and interview questions — all generated in seconds.",
              },
            ].map((item, i) => (
              <div
                key={item.step}
                className="fade-section group"
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <div className="flex items-center gap-4 mb-6">
                  <span className="text-6xl md:text-8xl font-extrabold text-zinc-200 group-hover:text-blue-500 transition-colors duration-500">
                    {item.step}
                  </span>
                </div>
                <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                <p className="text-zinc-500 leading-relaxed text-base">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section id="features" className="section-dark py-32 px-8">
        <div className="max-w-[1400px] mx-auto">
          <div className="fade-section mb-20">
            <p className="label-mono text-blue-400 mb-4">Features</p>
            <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-tight">
              Everything you need
              <br />
              <span className="text-white/40">to land the interview.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="fade-section feature-card"
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <f.icon className="w-8 h-8 text-blue-400 mb-5" />
                <h3 className="text-lg font-bold mb-3">{f.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── INTERACTIVE DEMO ─── */}
      <section className="section-light py-32 px-8">
        <div className="max-w-[1400px] mx-auto">
          <div className="fade-section mb-16">
            <p className="label-mono text-zinc-400 mb-4">See The Difference</p>
            <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-tight">
              Generic vs. Tailored
            </h2>
          </div>

          <div className="fade-section">
            {/* Tab switch */}
            <div className="flex gap-2 mb-8">
              <button
                onClick={() => setDemoTab("before")}
                className={`btn-pill text-xs ${
                  demoTab === "before"
                    ? "btn-pill-dark"
                    : "btn-pill-outline-dark"
                }`}
              >
                Before — Generic
              </button>
              <button
                onClick={() => setDemoTab("after")}
                className={`btn-pill text-xs ${
                  demoTab === "after"
                    ? "btn-pill-dark"
                    : "btn-pill-outline-dark"
                }`}
              >
                After — Tailored
              </button>
            </div>

            <div className="demo-slider-track bg-white p-8 md:p-12 relative">
              <div className="max-w-3xl">
                {demoTab === "before" ? (
                  <div key="before">
                    <p className="label-mono text-zinc-400 mb-4">
                      Original Resume Bullet
                    </p>
                    <p className="text-xl md:text-2xl leading-relaxed text-zinc-600">
                      &ldquo;Managed software development projects and
                      coordinated with cross-functional teams to deliver
                      products on time.&rdquo;
                    </p>
                    <div className="mt-8 flex items-center gap-3">
                      <span className="inline-block w-3 h-3 rounded-full bg-red-400" />
                      <span className="label-mono text-red-400">
                        Missing 6 keywords from JD
                      </span>
                    </div>
                  </div>
                ) : (
                  <div key="after">
                    <p className="label-mono text-zinc-400 mb-4">
                      Tailored Resume Bullet
                    </p>
                    <p className="text-xl md:text-2xl leading-relaxed text-zinc-900">
                      &ldquo;Led{" "}
                      <span className="text-blue-600 font-semibold">
                        agile
                      </span>{" "}
                      development of a{" "}
                      <span className="text-blue-600 font-semibold">
                        SaaS platform
                      </span>
                      , driving{" "}
                      <span className="text-blue-600 font-semibold">
                        cross-functional collaboration
                      </span>{" "}
                      across engineering, design, and{" "}
                      <span className="text-blue-600 font-semibold">
                        product management
                      </span>{" "}
                      to ship features{" "}
                      <span className="text-blue-600 font-semibold">
                        2 sprints ahead
                      </span>{" "}
                      of schedule, reducing{" "}
                      <span className="text-blue-600 font-semibold">
                        time-to-market
                      </span>{" "}
                      by 30%.&rdquo;
                    </p>
                    <div className="mt-8 flex items-center gap-3">
                      <span className="inline-block w-3 h-3 rounded-full bg-green-500" />
                      <span className="label-mono text-green-600">
                        6/6 JD Keywords matched
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── TESTIMONIALS ─── */}
      <section className="section-light py-32 px-8 border-t border-zinc-100">
        <div className="max-w-[1400px] mx-auto">
          <div className="fade-section mb-20">
            <p className="label-mono text-zinc-400 mb-4">What Users Say</p>
            <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight">
              Trusted by job seekers
            </h2>
          </div>

          <div className="space-y-0">
            {TESTIMONIALS.map((t, i) => (
              <div
                key={i}
                className="fade-section py-16 border-t border-zinc-200 first:border-t-0 grid md:grid-cols-[280px_1fr] gap-8 md:gap-16 items-start"
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <div>
                  <div className="w-16 h-16 rounded-full bg-zinc-200 mb-4 flex items-center justify-center text-2xl font-bold text-zinc-400">
                    {t.name[0]}
                  </div>
                  <p className="font-bold text-base">{t.name}</p>
                  <p className="text-sm text-zinc-500">
                    {t.role}
                    <br />
                    {t.company}
                  </p>
                </div>

                <p className="testimonial-quote text-zinc-700">
                  &ldquo;{t.quote}&rdquo;
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PRICING ─── */}
      <section id="pricing" className="section-dark py-32 px-8">
        <div className="max-w-[1400px] mx-auto">
          <div className="fade-section mb-20 text-center">
            <p className="label-mono text-blue-400 mb-4">Pricing</p>
            <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6">
              Simple, transparent pricing
            </h2>
            <p className="text-white/50 text-lg max-w-xl mx-auto mb-8">
              Start free. Upgrade when you need unlimited tailoring.
            </p>

            {/* Toggle */}
            <div className="flex items-center justify-center gap-4">
              <span
                className={`label-mono ${
                  !annual ? "text-white" : "text-white/40"
                } transition-colors`}
              >
                Monthly
              </span>
              <button
                onClick={() => setAnnual(!annual)}
                className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${
                  annual ? "bg-blue-500" : "bg-white/20"
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform duration-300 ${
                    annual ? "translate-x-7" : ""
                  }`}
                />
              </button>
              <span
                className={`label-mono ${
                  annual ? "text-white" : "text-white/40"
                } transition-colors`}
              >
                Annual{" "}
                <span className="text-blue-400 ml-1">Save 38%</span>
              </span>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Free */}
            <div className="fade-section pricing-card">
              <p className="label-mono text-white/40 mb-2">Free</p>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-5xl font-extrabold">$0</span>
                <span className="text-white/40 label-mono">/month</span>
              </div>
              <ul className="space-y-4 mb-10">
                {[
                  "3 tailored applications / month",
                  "Resume tailoring",
                  "Cover letter generation",
                  "Skill-gap analysis",
                ].map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-3 text-white/60 text-sm"
                  >
                    <span className="text-blue-400 mt-0.5">✓</span>
                    {f}
                  </li>
                ))}
                {[
                  "Interview questions",
                  "ATS compatibility check",
                  "Multi-resume versions",
                ].map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-3 text-white/25 text-sm"
                  >
                    <span className="mt-0.5">—</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/login"
                className="btn-pill btn-pill-outline w-full text-center"
              >
                Get Started Free
              </Link>
            </div>

            {/* Pro */}
            <div
              className="fade-section pricing-card highlighted"
              style={{ transitionDelay: "100ms" }}
            >
              <div className="flex items-center gap-3 mb-2">
                <p className="label-mono text-blue-400">Pro</p>
                <span className="label-mono text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">
                  Popular
                </span>
              </div>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-5xl font-extrabold">
                  ${annual ? "7" : "12"}
                </span>
                <span className="text-white/40 label-mono">
                  /month{annual ? " (billed annually)" : ""}
                </span>
              </div>
              <ul className="space-y-4 mb-10">
                {[
                  "Unlimited tailored applications",
                  "Resume tailoring",
                  "Cover letter generation",
                  "Skill-gap analysis",
                  "Interview questions",
                  "ATS compatibility check",
                  "Multi-resume versions",
                ].map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-3 text-white/70 text-sm"
                  >
                    <span className="text-blue-400 mt-0.5">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/login"
                className="btn-pill btn-pill-primary w-full text-center"
              >
                Start Pro — {annual ? "$89/year" : "$12/month"}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section id="faq" className="section-light py-32 px-8">
        <div className="max-w-[900px] mx-auto">
          <div className="fade-section mb-16">
            <p className="label-mono text-zinc-400 mb-4">FAQ</p>
            <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight">
              Common questions
            </h2>
          </div>

          <div className="fade-section">
            {FAQS.map((faq, i) => (
              <div key={i} className="faq-item">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between py-6 text-left"
                >
                  <span className="text-lg font-semibold pr-8">{faq.q}</span>
                  <span
                    className={`faq-icon text-2xl text-zinc-400 shrink-0 ${
                      openFaq === i ? "open" : ""
                    }`}
                  >
                    +
                  </span>
                </button>
                <div
                  className={`faq-answer text-zinc-500 leading-relaxed ${
                    openFaq === i ? "open" : ""
                  }`}
                >
                  {faq.a}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA BANNER ─── */}
      <section className="section-dark py-32 px-8">
        <div className="max-w-[900px] mx-auto text-center fade-section">
          <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6">
            Stop sending generic resumes.
          </h2>
          <p className="text-white/50 text-lg max-w-lg mx-auto mb-10">
            Join thousands of job seekers who land more interviews with AI-tailored applications.
          </p>
          <Link href="/login" className="btn-pill btn-pill-primary text-sm">
            Get Started Free — No Credit Card
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              className="ml-1"
            >
              <path
                d="M1 7h12M8 2l5 5-5 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="section-dark border-t border-white/[0.06] py-16 px-8">
        <div className="max-w-[1400px] mx-auto">
          <div className="grid md:grid-cols-4 gap-12 mb-16">
            <div>
              <Link
                href="/"
                className="text-white font-bold text-xl tracking-tight block mb-4"
              >
                JobFit
              </Link>
              <p className="text-white/40 text-sm leading-relaxed">
                AI-powered resume tailoring. Beat the ATS. Land more interviews.
              </p>
            </div>

            <div>
              <p className="label-mono text-white/30 mb-4">Product</p>
              <ul className="space-y-3">
                {["Features", "Pricing", "Chrome Extension", "How It Works"].map(
                  (item) => (
                    <li key={item}>
                      <a
                        href={`#${item.toLowerCase().replace(/\s+/g, "-")}`}
                        className="text-white/50 hover:text-white text-sm transition-colors"
                      >
                        {item}
                      </a>
                    </li>
                  )
                )}
              </ul>
            </div>

            <div>
              <p className="label-mono text-white/30 mb-4">Company</p>
              <ul className="space-y-3">
                {["About", "Blog", "Careers", "Contact"].map((item) => (
                  <li key={item}>
                    <a
                      href="#"
                      className="text-white/50 hover:text-white text-sm transition-colors"
                    >
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="label-mono text-white/30 mb-4">Legal</p>
              <ul className="space-y-3">
                {["Privacy Policy", "Terms of Service", "Cookie Policy"].map(
                  (item) => (
                    <li key={item}>
                      <a
                        href="#"
                        className="text-white/50 hover:text-white text-sm transition-colors"
                      >
                        {item}
                      </a>
                    </li>
                  )
                )}
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="border-t border-white/[0.06] pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="label-mono text-white/25 text-xs">
              © 2026 JobFit. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <a
                href="#"
                className="text-white/30 hover:text-white transition-colors"
                aria-label="Twitter"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="#"
                className="text-white/30 hover:text-white transition-colors"
                aria-label="LinkedIn"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
              <a
                href="#"
                className="text-white/30 hover:text-white transition-colors"
                aria-label="GitHub"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                </svg>
              </a>
            </div>
          </div>

          {/* Watermark */}
          <div className="mt-16 text-center overflow-hidden">
            <p className="footer-watermark text-white">JOBFIT</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
