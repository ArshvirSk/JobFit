import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Zap, LayoutDashboard, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

// Generate static params for the top 50-100 high-intent keywords
export async function generateStaticParams() {
  const commonRoles = [
    'software-engineer',
    'product-manager',
    'data-scientist',
    'ux-designer',
    'marketing-manager',
    'sales-executive'
  ];
  
  const topCompanies = [
    'google',
    'amazon',
    'meta',
    'apple',
    'netflix',
    'microsoft'
  ];

  const params = [];
  
  // Generate combinations (e.g. software-engineer-at-google)
  for (const role of commonRoles) {
    for (const company of topCompanies) {
      params.push({ slug: `${role}-at-${company}` });
    }
  }

  return params;
}

// Format slug to readable string (e.g. "software-engineer-at-google" -> "Software Engineer at Google")
function formatSlug(slug: string) {
  const parts = slug.split('-at-');
  if (parts.length !== 2) return { role: 'Professional', company: 'Top Company' };
  
  const role = parts[0].split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  const company = parts[1].split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  
  return { role, company };
}

// Generate dynamic SEO metadata
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const { role, company } = formatSlug(params.slug);
  
  const title = `Tailor Your Resume for ${role} at ${company} | JobFit AI`;
  const description = `Use JobFit AI to instantly tailor your resume and cover letter for the ${role} position at ${company}. Beat the ATS and land more interviews.`;
  
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
    }
  };
}

export default function SEORolePage({ params }: { params: { slug: string } }) {
  const { role, company } = formatSlug(params.slug);

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl text-blue-600">
            <Zap className="h-6 w-6 fill-current" />
            JobFit
          </div>
          <Link href="/">
            <Button>Try JobFit Free</Button>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-20 pb-16 px-6">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <h1 className="text-4xl md:text-5xl font-extrabold text-zinc-900 tracking-tight">
            How to format your resume for a <br className="hidden md:block"/>
            <span className="text-blue-600">{role}</span> role at <span className="text-blue-600">{company}</span>
          </h1>
          <p className="text-lg text-zinc-600 max-w-2xl mx-auto">
            {company} uses Applicant Tracking Systems (ATS) to filter out thousands of applications. 
            If your resume doesn't match their exact keywords for {role}, you won't get an interview.
          </p>
          <div className="pt-4 flex justify-center gap-4">
            <Link href="/">
              <Button size="lg" className="h-14 px-8 text-lg shadow-lg shadow-blue-500/20">
                Tailor My Resume Now <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Feature / Demonstration Section */}
      <section className="py-16 bg-white border-y">
        <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h2 className="text-3xl font-bold tracking-tight">Stop sending generic resumes.</h2>
            <p className="text-zinc-600 text-lg leading-relaxed">
              When applying for a {role} position at {company}, recruiters spend an average of 6 seconds looking at your resume. JobFit's Chrome extension sits right on the job posting, reads the requirements, and rewrites your base resume to highlight exactly what {company} is looking for.
            </p>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-6 w-6 text-green-500 shrink-0" />
                <span className="text-zinc-700">1-click resume tailoring directly on the {company} job board</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-6 w-6 text-green-500 shrink-0" />
                <span className="text-zinc-700">Automatic ATS formatting check to prevent auto-rejections</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-6 w-6 text-green-500 shrink-0" />
                <span className="text-zinc-700">Predict the exact interview questions {company} will ask you</span>
              </li>
            </ul>
          </div>
          
          <div className="relative">
            {/* Abstract visual representation of resume parsing */}
            <div className="absolute inset-0 bg-gradient-to-tr from-blue-100 to-transparent rounded-2xl transform translate-x-4 translate-y-4 -z-10"></div>
            <Card className="shadow-xl border-zinc-200">
              <CardContent className="p-6">
                <div className="flex items-center gap-4 border-b pb-4 mb-4">
                  <div className="h-12 w-12 rounded bg-blue-100 flex items-center justify-center">
                    <FileText className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-900">{role} Resume</h3>
                    <p className="text-xs text-green-600 font-medium">98% Match for {company}</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="h-2 bg-zinc-100 rounded w-full"></div>
                  <div className="h-2 bg-zinc-100 rounded w-5/6"></div>
                  <div className="h-2 bg-blue-100 rounded w-4/6 mt-4"></div>
                  <div className="h-2 bg-zinc-100 rounded w-full"></div>
                  <div className="h-2 bg-zinc-100 rounded w-3/4"></div>
                  <div className="h-2 bg-blue-100 rounded w-5/6 mt-4"></div>
                  <div className="h-2 bg-zinc-100 rounded w-full"></div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="mt-auto py-12 bg-zinc-900 text-zinc-400">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <div className="flex items-center justify-center gap-2 font-bold text-xl text-white mb-6">
            <Zap className="h-6 w-6 fill-blue-500 text-blue-500" />
            JobFit
          </div>
          <p className="mb-4 text-sm">© {new Date().getFullYear()} JobFit AI. All rights reserved.</p>
          <div className="flex justify-center gap-4 text-sm">
            <Link href="/" className="hover:text-white">Home</Link>
            <Link href="/" className="hover:text-white">Install Extension</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
