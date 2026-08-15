import { MetadataRoute } from 'next';

const BASE_URL = 'https://jobfit.app'; // Replace with actual production URL

export default function sitemap(): MetadataRoute.Sitemap {
  // Static routes
  const routes = [
    '',
    '/tailor',
    '/billing',
  ].map((route) => ({
    url: `${BASE_URL}${route}`,
    lastModified: new Date().toISOString(),
    changeFrequency: 'weekly' as const,
    priority: route === '' ? 1 : 0.8,
  }));

  // Generate dynamic SEO routes (matches generateStaticParams in roles/[slug]/page.tsx)
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

  const dynamicRoutes = [];
  
  for (const role of commonRoles) {
    for (const company of topCompanies) {
      dynamicRoutes.push({
        url: `${BASE_URL}/roles/${role}-at-${company}`,
        lastModified: new Date().toISOString(),
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      });
    }
  }

  return [...routes, ...dynamicRoutes];
}
