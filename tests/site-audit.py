"""Dependency-free checks for published pages, metadata, sitemap and local links.

Run from any directory: python -X utf8 tests/site-audit.py
These source checks do not prove Google indexing or rich-result eligibility.
"""
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlparse
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://pryzmat-glass.pl"
EXCLUDED = {".git", "docs", "tests", "scripts", "node_modules"}


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.headings, self.ids, self.links, self.resources = [], [], [], []
        self.canonicals, self.titles, self.images, self.schemas = [], [], [], []
        self.meta, self.captures, self.styles = {}, [], []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get("id"):
            self.ids.append(attrs["id"])
        if tag in {"title", "style", "h1", "h2", "h3", "h4", "h5", "h6"} or (
            tag == "script" and attrs.get("type") == "application/ld+json"
        ):
            self.captures.append([tag, ""])
        if tag == "br":
            self.handle_data(" ")
        if attrs.get("style"):
            self.styles.append(attrs["style"])
        if tag == "a" and attrs.get("href"):
            self.links.append(attrs["href"])
        if tag == "link" and "canonical" in attrs.get("rel", "").split():
            self.canonicals.append(attrs.get("href"))
        if tag == "meta" and attrs.get("name"):
            self.meta[attrs["name"].lower()] = attrs.get("content", "")
        if tag == "img":
            self.images.append(attrs)
        if tag in {"img", "script", "iframe", "source", "video"}:
            for key in ("src", "poster"):
                if attrs.get(key):
                    self.resources.append(attrs[key])
            if attrs.get("srcset"):
                self.resources.extend(item.strip().split()[0] for item in attrs["srcset"].split(","))
        if tag == "link" and attrs.get("rel") in {"stylesheet", "preload", "icon"}:
            self.resources.append(attrs.get("href", ""))

    def handle_data(self, data):
        for capture in self.captures:
            capture[1] += data

    def handle_endtag(self, tag):
        if self.captures and self.captures[-1][0] == tag:
            kind, value = self.captures.pop()
            if kind == "title":
                self.titles.append(" ".join(value.split()))
            elif kind == "script":
                self.schemas.append(json.loads(value))
            elif kind == "style":
                self.styles.append(value)
            else:
                self.headings.append((int(kind[1]), " ".join(value.split())))


def page_url(path):
    return ORIGIN + "/" + path.relative_to(ROOT).as_posix().removesuffix("index.html")


def local_target(reference, base):
    destination = urlparse(urljoin(base, reference))
    if destination.netloc not in {"pryzmat-glass.pl", "www.pryzmat-glass.pl"}:
        return None, destination
    path = ROOT / unquote(destination.path).lstrip("/")
    if path.is_dir() or not path.suffix:
        path /= "index.html"
    return path, destination


def audit():
    issues, pages = [], {}
    paths = sorted(path for path in ROOT.rglob("index.html") if not EXCLUDED.intersection(path.relative_to(ROOT).parts))
    for path in paths:
        label = path.relative_to(ROOT).as_posix()
        page = Page()
        try:
            page.feed(path.read_text(encoding="utf8"))
        except (ValueError, json.JSONDecodeError) as error:
            issues.append(f"{label}: invalid JSON-LD: {error}")
        pages[path] = page
        if page.canonicals != [page_url(path)]:
            issues.append(f"{label}: canonical must be the unique canonical URL")
        if len([heading for heading in page.headings if heading[0] == 1]) != 1:
            issues.append(f"{label}: expected one H1")
        if len(page.titles) != 1 or not page.titles[0] or not page.meta.get("description"):
            issues.append(f"{label}: expected one title and a description")
        if not page.meta.get("viewport"):
            issues.append(f"{label}: missing viewport")
        if "noindex" in page.meta.get("robots", "").lower():
            issues.append(f"{label}: unintended noindex on a published page")
        if len(page.ids) != len(set(page.ids)):
            issues.append(f"{label}: duplicate IDs")
        if any("alt" not in image for image in page.images):
            issues.append(f"{label}: missing image alt attribute")
        if not page.schemas:
            issues.append(f"{label}: missing JSON-LD")
        for previous, following in zip(page.headings, page.headings[1:]):
            if following[0] > previous[0] + 1:
                issues.append(f"{label}: heading level skipped before {following[1]}")

    link_count = 0
    for path, page in pages.items():
        inline_resources = [reference for style in page.styles for reference in re.findall(r'url\([\s\"\']*([^\)\"\']+)', style)]
        for reference in page.links + page.resources + inline_resources:
            if reference.startswith(("tel:", "mailto:", "data:")):
                continue
            target, destination = local_target(reference, page_url(path))
            if target is None:
                continue
            link_count += 1
            label = path.relative_to(ROOT).as_posix()
            if not target.exists():
                issues.append(f"{label}: missing local target {reference}")
            elif target in pages and destination.fragment and unquote(destination.fragment) not in pages[target].ids:
                issues.append(f"{label}: missing fragment {reference}")

    for path in ROOT.rglob("*.css"):
        if EXCLUDED.intersection(path.relative_to(ROOT).parts):
            continue
        for reference in re.findall(r'url\([\s\"\']*([^\)\"\']+)', path.read_text(encoding="utf8")):
            target, _ = local_target(reference, ORIGIN + "/" + path.relative_to(ROOT).as_posix())
            if target is not None and not target.exists():
                issues.append(f"{path.relative_to(ROOT)}: missing CSS resource {reference}")

    sitemap = [node.text for node in ET.parse(ROOT / "sitemap.xml").iter() if node.tag.endswith("loc")]
    if set(sitemap) != set(map(page_url, paths)) or len(sitemap) != len(set(sitemap)):
        issues.append("Sitemap must list each published canonical URL exactly once")
    robots = (ROOT / "robots.txt").read_text(encoding="utf8")
    if f"Sitemap: {ORIGIN}/sitemap.xml" not in robots or re.search(r"(?im)^Disallow:\s*/\s*$", robots):
        issues.append("robots.txt blocks the site or does not reference its sitemap")
    print(json.dumps({"result": "FAIL" if issues else "PASS", "pages": len(paths), "sitemap_urls": len(sitemap), "local_links_and_resources_checked": link_count, "issues": issues}, ensure_ascii=False, indent=2))
    return bool(issues)


if __name__ == "__main__":
    sys.exit(audit())
