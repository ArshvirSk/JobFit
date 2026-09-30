import zipfile
import csv
import io
import logging
from typing import List, Dict, Any
from backend.models.schemas import ParsedResume, Experience, Education

logger = logging.getLogger(__name__)

def parse_linkedin_zip(zip_path: str) -> ParsedResume:
    """Extracts relevant CSVs from a LinkedIn data export zip and builds a ParsedResume object."""
    profile_data = {"name": "", "headline": "", "summary": ""}
    positions = []
    education = []
    skills = []
    certifications = []

    with zipfile.ZipFile(zip_path, 'r') as z:
        file_names = z.namelist()
        
        # Helper to read a specific CSV if it exists (case-insensitive check)
        def read_csv(target_name: str) -> List[Dict[str, str]]:
            for fname in file_names:
                if target_name.lower() in fname.lower() and fname.endswith('.csv'):
                    with z.open(fname) as f:
                        # Decode bytes to string
                        text = f.read().decode('utf-8', errors='ignore')
                        reader = csv.DictReader(io.StringIO(text))
                        return list(reader)
            return []

        # Parse Profile.csv
        profile_rows = read_csv("Profile.csv")
        if profile_rows:
            row = profile_rows[0]
            first_name = row.get("First Name", "")
            last_name = row.get("Last Name", "")
            profile_data["name"] = f"{first_name} {last_name}".strip()
            profile_data["headline"] = row.get("Headline", "")
            profile_data["summary"] = row.get("Summary", "")

        # Parse Positions.csv
        pos_rows = read_csv("Positions.csv")
        for row in pos_rows:
            # Check common LinkedIn export headers
            company = row.get("Company Name", "")
            title = row.get("Title", "")
            if not company and not title:
                continue
            
            started_on = row.get("Started On", "")
            finished_on = row.get("Finished On", "")
            desc = row.get("Description", "")
            
            bullets = [d.strip() for d in desc.split('\n') if d.strip()] if desc else []
            
            positions.append(Experience(
                company=company,
                role=title,
                start_date=started_on,
                end_date=finished_on if finished_on else None,
                bullets=bullets
            ))

        # Parse Education.csv
        edu_rows = read_csv("Education.csv")
        for row in edu_rows:
            school = row.get("School Name", "")
            if not school:
                continue
                
            degree = row.get("Degree Name", "")
            notes = row.get("Notes", "")
            # Sometimes end date is available
            end_date = row.get("End Date", "")
            
            education.append(Education(
                institution=school,
                degree=degree,
                graduation_date=end_date if end_date else None
            ))

        # Parse Skills.csv
        skill_rows = read_csv("Skills.csv")
        for row in skill_rows:
            skill = row.get("Name", "")
            if skill:
                skills.append(skill)

        # Parse Certifications.csv
        cert_rows = read_csv("Certifications.csv")
        for row in cert_rows:
            cert = row.get("Name", "")
            if cert:
                certifications.append(cert)

    # Construct the raw text version
    raw_text_parts = []
    raw_text_parts.append(f"Name: {profile_data['name']}")
    raw_text_parts.append(f"Headline: {profile_data['headline']}")
    raw_text_parts.append(f"Summary: {profile_data['summary']}")
    
    raw_text_parts.append("\nEXPERIENCE:")
    for pos in positions:
        raw_text_parts.append(f"- {pos.role} at {pos.company} ({pos.start_date} to {pos.end_date or 'Present'})")
        for b in pos.bullets:
            raw_text_parts.append(f"  * {b}")
            
    raw_text_parts.append("\nEDUCATION:")
    for ed in education:
        raw_text_parts.append(f"- {ed.degree} from {ed.institution} ({ed.graduation_date or ''})")

    raw_text_parts.append("\nSKILLS:")
    raw_text_parts.append(", ".join(skills))
    
    # Return a unified ParsedResume
    return ParsedResume(
        name=profile_data["name"] or "LinkedIn Profile",
        contact_info="", # Usually not easily exported or needed for context
        summary=f"{profile_data['headline']}\n{profile_data['summary']}".strip(),
        experience=positions,
        education=education,
        skills=skills,
        certifications=certifications,
        projects=[]
    ), "\n".join(raw_text_parts)
