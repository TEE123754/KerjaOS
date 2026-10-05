import html
import asyncio
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict
from ..config import settings
from .agents.matching_agent import build_position_fit_assessment
from .agents.bias_agent import lookup_qs_rank_from_csv

try:
    from apify_client.errors import ApifyApiError
except Exception:
    class ApifyApiError(Exception):
        pass

LAST_APIFY_PROFILE_ERROR = ""


def _get_run_field(run: Any, field_snake: str, field_camel: str) -> Any:
    if run is None:
        return None
    if isinstance(run, dict):
        return run.get(field_camel) or run.get(field_snake)
    return getattr(run, field_snake, None) or getattr(run, field_camel, None)



def normalize_linkedin_profile_url(linkedin_url: str) -> str:
    raw_url = (linkedin_url or "").strip()
    if not raw_url:
        raise ValueError("Please enter a LinkedIn profile URL.")
    if not re.match(r"^https?://", raw_url, flags=re.IGNORECASE):
        raw_url = f"https://{raw_url}"

    parsed = urllib.parse.urlparse(raw_url)
    host = (parsed.netloc or "").lower().split(":")[0]
    if not host.endswith("linkedin.com"):
        raise ValueError("Please enter a valid LinkedIn profile URL such as https://www.linkedin.com/in/username.")

    path_parts = [urllib.parse.unquote(part) for part in parsed.path.split("/") if part]
    profile_prefixes = {"in", "pub"}
    slug = ""
    for index, part in enumerate(path_parts):
        if part.lower() in profile_prefixes and index + 1 < len(path_parts):
            slug = path_parts[index + 1].strip()
            break
    if not slug:
        raise ValueError("Please enter a LinkedIn profile URL containing /in/username or /pub/username.")

    safe_slug = urllib.parse.quote(slug.strip("/"), safe="-_%")
    return f"https://www.linkedin.com/in/{safe_slug}"


def _name_from_url(linkedin_url: str) -> str:
    try:
        linkedin_url = normalize_linkedin_profile_url(linkedin_url)
    except ValueError:
        return "Alex Mercer"
    slug = urllib.parse.urlparse(linkedin_url).path.split("/in/")[-1].strip("/")
    return slug.replace("-", " ").replace("_", " ").strip().title() or "Alex Mercer"


def _is_linkedin_profile_url(linkedin_url: str) -> bool:
    try:
        normalize_linkedin_profile_url(linkedin_url)
        return True
    except ValueError:
        return False


def _extract_meta(html_text: str, property_name: str) -> str:
    patterns = [
        rf'<meta[^>]+property=["\']{re.escape(property_name)}["\'][^>]+content=["\']([^"\']+)["\']',
        rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']{re.escape(property_name)}["\']'
    ]
    for pattern in patterns:
        match = re.search(pattern, html_text, flags=re.IGNORECASE)
        if match:
            return html.unescape(match.group(1)).strip()
    return ""


def _fetch_public_metadata(linkedin_url: str) -> Dict[str, str]:
    request = urllib.request.Request(
        linkedin_url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; RecruitingWorkspace/1.0)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
    )
    with urllib.request.urlopen(request, timeout=8) as response:
        html_text = response.read(400_000).decode("utf-8", errors="ignore")

    return {
        "title": _extract_meta(html_text, "og:title"),
        "description": _extract_meta(html_text, "og:description"),
        "image": _extract_meta(html_text, "og:image"),
    }


def _model_dump(value: Any) -> Dict[str, Any]:
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if hasattr(value, "dict"):
        return value.dict()
    return dict(value or {})


def _date_range(item: Dict[str, Any]) -> str:
    start = item.get("from_date") or ""
    end = item.get("to_date") or ""
    duration = item.get("duration") or ""
    if start or end:
        return f"{start} - {end or 'Present'}".strip()
    return duration


def _scrape_with_optional_cookie(linkedin_url: str) -> Dict[str, Any]:
    return {}  # Authenticated-cookie scraping was removed in M1.

def parse_apify_profile(item: Dict[str, Any], linkedin_url: str) -> Dict[str, Any]:
    # Name
    first_name = item.get("firstName") or ""
    last_name = item.get("lastName") or ""
    name = item.get("name") or item.get("fullName") or ""
    if not name and (first_name or last_name):
        name = f"{first_name} {last_name}".strip()
    if not name:
        name = _name_from_url(linkedin_url)
        
    # Headline
    headline = item.get("headline") or item.get("subTitle") or item.get("position") or "LinkedIn Candidate"
    if isinstance(headline, dict):
        headline = headline.get("text") or "LinkedIn Candidate"
    
    # Location
    location = item.get("location") or item.get("city") or "Pending manual verification"
    if isinstance(location, dict):
        location = location.get("linkedinText") or location.get("parsed", {}).get("text") or location.get("text") or "Pending manual verification"
    
    # About
    about = item.get("about") or item.get("summary") or item.get("description") or ""
    
    # Profile picture
    profile_image_url = item.get("avatar") or item.get("profilePicUrl") or item.get("profilePicture") or item.get("photo") or ""
    if isinstance(profile_image_url, dict):
        profile_image_url = profile_image_url.get("url") or ""
    
    # Experiences
    experiences = []
    apify_exp = item.get("experiences") or item.get("experience") or item.get("positions") or item.get("jobs") or []
    for exp in apify_exp:
        title = exp.get("title") or exp.get("position") or exp.get("position_title") or exp.get("role") or ""
        company = exp.get("companyName") or exp.get("company") or exp.get("institution_name") or ""
        
        # duration
        duration = exp.get("duration") or ""
        if not duration:
            start = exp.get("startDate") or ""
            if isinstance(start, dict):
                start = start.get("text") or start.get("year") or ""
            end = exp.get("endDate") or "Present"
            if isinstance(end, dict):
                end = end.get("text") or end.get("year") or "Present"
            if start:
                if isinstance(start, str) and start.startswith("undefined "):
                    start = start.replace("undefined ", "")
                if isinstance(end, str) and end.startswith("undefined "):
                    end = end.replace("undefined ", "")
                duration = f"{start} - {end}"
                
        experiences.append({
            "title": title,
            "company": company,
            "duration": duration,
            "description": exp.get("description") or ""
        })
        
    # Education
    education = []
    apify_edu = item.get("education") or item.get("educations") or item.get("schools") or []
    for edu in apify_edu:
        school = edu.get("schoolName") or edu.get("school") or edu.get("institution_name") or ""
        
        # degree name
        degree = edu.get("degree") or edu.get("degreeName") or ""
        field = edu.get("fieldOfStudy") or ""
        if degree and field:
            degree_str = f"{degree} in {field}"
        elif degree:
            degree_str = degree
        else:
            degree_str = field or "Degree details pending verification"
            
        # duration
        duration = edu.get("duration") or edu.get("dateRange") or ""
        if not duration:
            start = edu.get("startDate") or ""
            if isinstance(start, dict):
                start = start.get("text") or start.get("year") or ""
            end = edu.get("endDate") or "Present"
            if isinstance(end, dict):
                end = end.get("text") or end.get("year") or "Present"
            if start:
                if isinstance(start, str) and start.startswith("undefined "):
                    start = start.replace("undefined ", "")
                if isinstance(end, str) and end.startswith("undefined "):
                    end = end.replace("undefined ", "")
                duration = f"{start} - {end}"
                
        education.append({
            "school": school,
            "degree": degree_str,
            "duration": duration,
            "description": edu.get("description") or edu.get("activities") or ""
        })
        
    # Email
    email = item.get("email") or item.get("emailAddress") or ""
    if not email:
        emails = item.get("emails") or []
        if isinstance(emails, list) and emails:
            email = emails[0]
    if not email:
        contact_details = item.get("contactInfo", {})
        if isinstance(contact_details, dict):
            email = contact_details.get("email") or ""
            
    if not email:
        slug = re.sub(r"[^a-z0-9]+", ".", name.lower()).strip(".") or "candidate"
        email = f"{slug}@email.com"
        
    return {
        "name": name,
        "email": email,
        "headline": headline,
        "location": location,
        "about": about,
        "experiences": experiences,
        "education": education,
        "profile_image_url": profile_image_url,
        "scrape_status": "apify_scraped",
        "scrape_warning": "LinkedIn profile details were captured via Apify live scraper. Verify before outreach.",
        "source_url": linkedin_url,
        "source_type": "linkedin",
        "source_method": "manual_apify"
    }


def scrape_linkedin_profile_apify(linkedin_url: str) -> Dict[str, Any] | None:
    return None  # Paid source integration disabled in M1.


def scrape_linkedin_profile(linkedin_url: str) -> Dict[str, Any]:
    """Legacy public metadata reader; authenticated-cookie scraping removed."""
    linkedin_url = normalize_linkedin_profile_url(linkedin_url)

    # 1. Prefer Apify live scraper if API key is configured
    apify_profile = scrape_linkedin_profile_apify(linkedin_url)
    if apify_profile:
        return apify_profile

    # 2. Fall back to local authenticated browser scrape
    authenticated_profile = _scrape_with_optional_cookie(linkedin_url)
    if authenticated_profile:
        return authenticated_profile

    candidate_name = _name_from_url(linkedin_url)
    headline = "LinkedIn profile pending verification"
    about = ""
    profile_image_url = ""
    scrape_status = "url_only"
    scrape_warning = (
        "LinkedIn did not expose public profile details to this scraper. "
        "Only the profile URL/name were captured; verify the candidate manually before outreach."
    )

    try:
        metadata = _fetch_public_metadata(linkedin_url)
        title = metadata.get("title", "")
        description = metadata.get("description", "")
        if title and "linkedin" not in title.lower():
            candidate_name = title.split("|")[0].split("-")[0].strip() or candidate_name
        if description:
            headline = description[:180]
            about = description
            scrape_status = "public_metadata"
            scrape_warning = (
                "Only public LinkedIn metadata was available. Experience, education, location, and skills still need verification."
            )
        profile_image_url = metadata.get("image", "")
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as e:
        # LinkedIn blocks unauthenticated scrapers — this is expected. Fall back to url_only mode.
        import logging
        logging.getLogger(__name__).debug("LinkedIn public metadata unavailable (expected): %s", e)

    slug = re.sub(r"[^a-z0-9]+", ".", candidate_name.lower()).strip(".") or "candidate"
    return {
        "name": candidate_name,
        "email": f"{slug}@email.com",
        "headline": headline,
        "location": "Pending manual verification",
        "about": about,
        "experiences": [],
        "education": [],
        "profile_image_url": profile_image_url,
        "scrape_status": scrape_status,
        "scrape_warning": scrape_warning,
        "source_url": linkedin_url,
        "source_type": "linkedin",
        "source_method": "manual_public"
    }


def scrape_live_linkedin_profile(linkedin_url: str) -> Dict[str, Any]:
    raise RuntimeError("Live social scraping is disabled; use permitted sources in M7")
    """Read a LinkedIn profile only when a live scraper returns profile data."""
    linkedin_url = normalize_linkedin_profile_url(linkedin_url)

    apify_profile = scrape_linkedin_profile_apify(linkedin_url)
    if apify_profile:
        return apify_profile

    authenticated_profile = _scrape_with_optional_cookie(linkedin_url)
    if authenticated_profile:
        return authenticated_profile

    has_apify = bool(settings.APIFY_API_TOKEN.strip())
    has_cookie = bool(settings.LINKEDIN_LI_AT_COOKIE.strip())
    apify_detail = f" Apify detail: {LAST_APIFY_PROFILE_ERROR}" if has_apify and LAST_APIFY_PROFILE_ERROR else ""
    if has_apify or has_cookie:
        raise RuntimeError(
            "Live LinkedIn profile scraping did not return usable profile data. "
            "LinkedIn may be blocking the scraper, the Apify actor may need approval, "
            "or the authenticated LinkedIn cookie may be expired."
            f"{apify_detail}"
        )

    raise RuntimeError(
        "Manual LinkedIn URL scrape requires live scraper credentials. "
        "Set APIFY_API_TOKEN for Apify live scraping or LINKEDIN_LI_AT_COOKIE for authenticated LinkedIn scraping. "
        "No URL-only candidate was staged."
    )


def build_fast_match_results(job: Dict[str, Any], profile_data: Dict[str, Any], bias_controls: Dict[str, Any] | None = None, prestige_analysis: Dict[str, Any] | None = None) -> Dict[str, Any]:
    if isinstance(profile_data, dict):
        education = profile_data.get("education") or []
        for edu in education:
            if isinstance(edu, dict):
                school = edu.get("school") or edu.get("institution") or ""
                if school and not edu.get("qs_rank"):
                    rank = lookup_qs_rank_from_csv(school)
                    if rank:
                        edu["qs_rank"] = rank
    return build_position_fit_assessment(job, profile_data, bias_controls, prestige_analysis)


def build_fast_outreach(profile_data: Dict[str, Any], job: Dict[str, Any]) -> Dict[str, str]:
    name = profile_data.get("name", "there")
    position = job.get("title", "our open role")
    department = job.get("department", "the hiring team")
    requirements = ", ".join(job.get("requirements", [])[:3]) or "the role requirements"
    return {
        "sourcing_pitch": f"{name} appears aligned with {position}; verify role depth, recent impact, and interest level before advancing.",
        "outreach_email": f"Subject: Invitation to interview for {position}\n\nDear {name},\n\nI'm reaching out from Intelligent Recruiter Workspace about our {position} role in {department}. We found your profile through LinkedIn sourcing while looking for candidates with experience related to {requirements}.\n\nYour background appears potentially relevant, and we would like to invite you to create or log in to the candidate portal and complete a personalized warm-up interview session.\n\nBest regards,\nIntelligent Recruiter Workspace Hiring Team"
    }


