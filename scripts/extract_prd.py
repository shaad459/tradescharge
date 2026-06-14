import zipfile
import re
import os

path = r"c:\Users\shaad\OneDrive\Desktop\TRADESCHARGE PRD.docx"
out = r"d:\Tradescharge\docs\PRD-extracted.txt"

os.makedirs(os.path.dirname(out), exist_ok=True)

with zipfile.ZipFile(path) as z:
    xml = z.read("word/document.xml").decode("utf-8")

text = re.sub(r"<w:tab[^/]*/>", "\t", xml)
text = re.sub(r"</w:p>", "\n", text)
text = re.sub(r"<[^>]+>", "", text)
for entity, char in [("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"')]:
    text = text.replace(entity, char)
text = re.sub(r"\n\s*\n+", "\n\n", text)

with open(out, "w", encoding="utf-8") as f:
    f.write(text.strip())

print(f"Wrote {out} ({len(text)} chars)")
