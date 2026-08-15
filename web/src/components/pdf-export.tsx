"use client";

import { useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PDFExportProps {
  resume: any; // Using any for simplicity in this component, but aligns with ParsedResume
}

export function PDFExport({ resume }: PDFExportProps) {
  const [isExporting, setIsExporting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleExport = async () => {
    if (!containerRef.current) return;
    
    setIsExporting(true);
    try {
      // Dynamically import html2pdf to avoid SSR issues
      const html2pdf = (await import("html2pdf.js")).default;
      
      const element = containerRef.current;
      const opt = {
        margin:       [10, 10, 10, 10] as [number, number, number, number], // top, left, bottom, right
        filename:     `${resume.name.replace(/\s+/g, '_')}_Resume.pdf`,
        image:        { type: 'jpeg' as const, quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
      };

      // Ensure the element is temporarily visible for printing
      element.style.display = 'block';
      await html2pdf().set(opt).from(element).save();
      element.style.display = 'none';
      
    } catch (err) {
      console.error("Failed to generate PDF", err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={handleExport} disabled={isExporting}>
        {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
        Export PDF
      </Button>

      {/* Hidden ATS-friendly Template for PDF Generation */}
      <div 
        ref={containerRef} 
        style={{ display: 'none', backgroundColor: 'white', padding: '20px', color: 'black', fontFamily: 'Arial, sans-serif' }}
        className="w-[800px] text-sm" // Fixed width for consistent PDF sizing
      >
        <div style={{ textAlign: 'center', marginBottom: '24px', borderBottom: '1px solid black', paddingBottom: '12px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 8px 0' }}>{resume.name}</h1>
          <p style={{ margin: 0, fontSize: '12px' }}>{resume.contact_info}</p>
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 'bold', borderBottom: '1px solid #ccc', textTransform: 'uppercase', marginBottom: '8px' }}>
            Professional Summary
          </h2>
          <p style={{ margin: 0 }}>{resume.summary}</p>
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 'bold', borderBottom: '1px solid #ccc', textTransform: 'uppercase', marginBottom: '8px' }}>
            Experience
          </h2>
          {resume.experience.map((exp: any, i: number) => (
            <div key={i} style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                <span style={{ fontWeight: 'bold' }}>{exp.role}</span>
                <span style={{ fontStyle: 'italic', fontSize: '12px' }}>{exp.start_date} - {exp.end_date || "Present"}</span>
              </div>
              <div style={{ fontWeight: '600', marginBottom: '4px' }}>{exp.company}</div>
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                {exp.bullets.map((b: string, j: number) => (
                  <li key={j} style={{ marginBottom: '4px' }}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {resume.education && resume.education.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 'bold', borderBottom: '1px solid #ccc', textTransform: 'uppercase', marginBottom: '8px' }}>
              Education
            </h2>
            {resume.education.map((edu: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontWeight: 'bold' }}>{edu.degree} — {edu.institution}</span>
                <span>{edu.graduation_date}</span>
              </div>
            ))}
          </div>
        )}

        {resume.skills && resume.skills.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 'bold', borderBottom: '1px solid #ccc', textTransform: 'uppercase', marginBottom: '8px' }}>
              Skills
            </h2>
            <p style={{ margin: 0 }}>{resume.skills.join(", ")}</p>
          </div>
        )}
      </div>
    </>
  );
}
