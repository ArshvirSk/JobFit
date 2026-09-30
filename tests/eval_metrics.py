"""Deterministic evaluation metrics for the JobFit tailoring pipeline.

These metrics are intentionally heuristic and reference-based (no LLM judge):
they compare pipeline output against the golden input resume and the golden JD
with set/keyword logic. That makes them cheap, stable in CI, and good at
catching the single worst failure mode of a tailoring pipeline — fabrication —
plus keyword coverage and structural damage. They are NOT a substitute for
human review of writing quality; they are a regression fence.

Every scorer returns a dataclass with a numeric score plus a ``violations``
list so failures are debuggable, not just a bare number.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from backend.models.schemas import ParsedResume


@dataclass
class MetricResult:
    """Result of one deterministic metric."""

    name: str
    score: float          # 0.0 .. 1.0 (1.0 = best)
    passed: bool
    threshold: float
    violations: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Normalization helpers
# ---------------------------------------------------------------------------

_COMMON_WORDS = {"and", "of", "the", "for", "with", "in", "on", "a", "an", "to"}


def _stemmed_phrase(text: str) -> str:
    """Normalized + stemmed form of a free-text passage, used as a phrase-level
    reference so multiword skills like 'A/B testing' can match prose like
    'ran a/b tests' despite different tokenization."""
    normalized = normalize_entity(text)
    return " ".join(_stem(t) for t in normalized.split())


def _stem(token: str) -> str:
    """Morphology-light stemming: folds plural/gerund/past-tense suffixes so
    'payments' matches 'payment' and 'testing' matches 'test' without pulling
    in a real stemmer dependency."""
    if len(token) > 4 and token.endswith("ing"):
        return token[:-3]
    if len(token) > 4 and token.endswith("ies"):
        return token[:-3] + "y"
    if len(token) > 3 and token.endswith("ed"):
        return token[:-2]
    if len(token) > 3 and token.endswith("es"):
        return token[:-2]
    if len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def normalize_entity(value: str) -> str:
    """Normalize a skill/keyword string for set comparison.

    Lowercases, strips punctuation, and collapses whitespace. Used for both
    skills and keywords so 'Node.JS' == 'nodejs' == 'Node JS' style variants
    don't produce false positives.
    """
    lowered = value.lower().strip()
    cleaned = re.sub(r"[^\w\s+#.-]", " ", lowered)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def entity_variants(entity: str) -> set[str]:
    """Generate comparable variants of an entity for tolerant matching.

    Includes the normalized form, a punctuation-stripped (compacted) form,
    a slash-joined token form ('A/B testing' → 'ab testing'), and stemmed
    variants of each ('payments' → 'payment').
    """
    base = normalize_entity(entity)
    variants = {base}
    squashed = re.sub(r"[\s/\-_.]+", "", base)
    if squashed:
        variants.add(squashed)
    tokens = base.split()
    if len(tokens) > 1:
        # 'A/B testing' → 'ab testing'; 'CI/CD pipelines' → 'cicd pipelines'
        joined = " ".join(re.sub(r"[\s/\-_.]+", "", t) for t in tokens)
        variants.add(joined)
        variants.add(joined.replace(" ", ""))
    stemmed = {" ".join(_stem(t) for t in v.split()) for v in variants}
    variants |= stemmed
    return variants


def _matches_any(entity: str, reference_set: set[str]) -> bool:
    """True if any variant of ``entity`` appears in ``reference_set`` or as a
    substring of a longer reference entry (so 'SQL' matches 'PostgreSQL', and
    a compacted variant like 'ab test' matches the phrase 'a/b tests' inside
    a longer reference string)."""
    for variant in entity_variants(entity):
        if variant in reference_set:
            return True
        # Substring tolerance: short tokens like 'SQL' inside 'postgresql'
        if len(variant) >= 3 and any(variant in ref for ref in reference_set):
            return True
    return False


# ---------------------------------------------------------------------------
# Metric 1: Entity faithfulness (anti-fabrication)
# ---------------------------------------------------------------------------

def entity_faithfulness(input_resume: ParsedResume, output_resume: ParsedResume) -> MetricResult:
    """Check that every entity in the tailored resume exists in the input.

    Fabrication policy — an entity in the output counts as FABRICATED unless
    a tolerantly-matched counterpart exists in the corresponding input pool:

      - skills      must appear in input skills, OR anywhere in the input
                    summary/bullets (the model may surface a skill that the
                    input listed in prose but omitted from the skills list);
      - companies   must match an input experience company;
      - institutions must match an input education institution.

    Score = 1 - (fabricated_count / total_output_entities); empty output
    scores 1.0 (nothing fabricated) but is caught by coverage metrics.
    """
    # Build the input entity pool
    input_skills = set()
    for skill in input_resume.skills:
        input_skills |= entity_variants(skill)
    for exp in input_resume.experience:
        for bullet in exp.bullets:
            for token in re.findall(r"[A-Za-z][\w+#./-]+", bullet):
                input_skills.add(token.lower())
            # Phrase-level reference (stemmed) so multiword skills match prose
            input_skills.add(_stemmed_phrase(bullet))
    for extra in (input_resume.summary or "").split():
        if len(extra) >= 3:
            input_skills.add(extra.strip(".,;:()").lower())
    if input_resume.summary:
        input_skills.add(_stemmed_phrase(input_resume.summary))

    input_companies = {normalize_entity(e.company) for e in input_resume.experience}
    input_institutions = {normalize_entity(e.institution) for e in input_resume.education}

    violations: list[str] = []
    total = 0

    # Skills: extracted from output skills list, plus capitalized acronyms in bullets
    output_skills = set()
    for skill in output_resume.skills:
        output_skills.add(skill)
    for exp in output_resume.experience:
        for bullet in exp.bullets:
            # Only acronyms (AWS, SQL) and punctuated tech tokens (C++, Node.js)
            # are harvested from bullets — Titlecase words are usually sentence
            # starts ('Developed…'), not skills. Skills-list fabrications are
            # still fully captured above.
            for token in re.findall(r"\b[A-Z]{2,}\b|\b[A-Za-z]+(?:\+\+|#|\.js|\.py)\b", bullet):
                output_skills.add(token)

    for skill in output_skills:
        total += 1
        if not _matches_any(skill, input_skills):
            violations.append(f"fabricated skill: '{skill}'")

    for exp in output_resume.experience:
        total += 1
        if normalize_entity(exp.company) not in input_companies and not _matches_any(exp.company, input_companies):
            violations.append(f"fabricated employer: '{exp.company}'")

    for edu in output_resume.education:
        total += 1
        if (
            normalize_entity(edu.institution) not in input_institutions
            and not _matches_any(edu.institution, input_institutions)
        ):
            violations.append(f"fabricated institution: '{edu.institution}'")

    score = 1.0 if total == 0 else 1.0 - (len(violations) / total)
    return MetricResult(
        name="entity_faithfulness",
        score=round(max(0.0, score), 4),
        passed=not violations,
        threshold=1.0,
        violations=violations,
    )


# ---------------------------------------------------------------------------
# Metric 2: JD keyword coverage
# ---------------------------------------------------------------------------

def jd_keyword_coverage(
    jd_required: list[str],
    jd_keywords: list[str] | None,
    output_resume: ParsedResume,
) -> MetricResult:
    """Fraction of JD required skills + keywords findable in the tailored resume.

    A keyword is covered if it matches any output skill, any bullet text
    (case-insensitive substring), or the summary. This is the ATS-alignment
    measure the tailoring step exists to improve.
    """
    haystack_parts = [output_resume.summary or ""]
    haystack_parts.extend(output_resume.skills)
    for exp in output_resume.experience:
        haystack_parts.extend(exp.bullets)
    haystack = " ".join(haystack_parts).lower()

    targets = list(jd_required) + list(jd_keywords or [])
    if not targets:
        return MetricResult(name="jd_keyword_coverage", score=1.0, passed=True, threshold=0.8, violations=[])

    haystack_lower = haystack.lower()
    token_bag = {_stem(t) for t in re.findall(r"[a-z0-9]+", haystack_lower)}

    missing: list[str] = []
    for target in targets:
        covered = False
        for variant in entity_variants(target):
            if variant in haystack_lower:
                covered = True
                break
            # Token-bag match with stemming: 'A/B testing' matches prose
            # like 'ran a/b tests'; 'payments' matches 'payment flows'.
            v_tokens = [_stem(t) for t in re.findall(r"[a-z0-9]+", variant)]
            if v_tokens and all(t in token_bag for t in v_tokens):
                covered = True
                break
        if not covered:
            missing.append(target)

    coverage = (len(targets) - len(missing)) / len(targets)
    return MetricResult(
        name="jd_keyword_coverage",
        score=round(coverage, 4),
        passed=coverage >= 0.8,
        threshold=0.8,
        violations=[f"missing from tailored resume: '{m}'" for m in missing],
    )


# ---------------------------------------------------------------------------
# Metric 3: Structure preservation
# ---------------------------------------------------------------------------

def structure_preservation(input_resume: ParsedResume, output_resume: ParsedResume) -> MetricResult:
    """Ensure tailoring did not destroy resume structure.

    Checks (per the tailoring prompt's contract):
      - same top-level sections present (name/contact/summary/experience/education/skills);
      - number of experience entries unchanged (reordering allowed, deletion not);
      - every output bullet either existed in the input or is a clearly derived
        rephrasing — approximated by: bullets per company may not INCREASE
        (padding with new bullets is a fabrication vector) and total bullet
        count may not drop by more than 25%.
    """
    violations: list[str] = []

    if not output_resume.name:
        violations.append("missing name")
    if not output_resume.contact_info:
        violations.append("missing contact_info")
    if output_resume.summary is None:
        violations.append("missing summary")

    input_exp = {normalize_entity(e.company): e for e in input_resume.experience}
    total_in_bullets = sum(len(e.bullets) for e in input_resume.experience)
    total_out_bullets = sum(len(e.bullets) for e in output_resume.experience)

    if len(output_resume.experience) > len(input_resume.experience):
        violations.append(
            f"experience entries grew: {len(input_resume.experience)} → {len(output_resume.experience)}"
        )

    # Every input employer must still be present — tailoring may reorder or
    # tighten entries, but silently deleting a job is distortion.
    output_companies = {normalize_entity(e.company) for e in output_resume.experience}
    for exp in input_resume.experience:
        if not (_matches_any(exp.company, output_companies)):
            violations.append(f"experience entry dropped: '{exp.company}'")

    for exp in output_resume.experience:
        key = normalize_entity(exp.company)
        source = input_exp.get(key)
        if source is None:
            # Tolerant match on variants
            for in_key, in_exp in input_exp.items():
                if _matches_any(exp.company, {in_key}):
                    source = in_exp
                    break
        if source is not None and len(exp.bullets) > len(source.bullets):
            violations.append(
                f"bullets padded for '{exp.company}': {len(source.bullets)} → {len(exp.bullets)}"
            )

    if total_in_bullets and total_out_bullets < 0.75 * total_in_bullets:
        violations.append(
            f"bullet count shrank beyond tolerance: {total_in_bullets} → {total_out_bullets}"
        )

    score = 1.0 - min(1.0, len(violations) / 4.0)
    return MetricResult(
        name="structure_preservation",
        score=round(score, 4),
        passed=not violations,
        threshold=1.0,
        violations=violations,
    )
