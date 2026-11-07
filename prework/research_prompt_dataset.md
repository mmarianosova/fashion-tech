# Research prompt: build the clothing-label dataset

Paste this into a Claude research run (or give it to a teammate). Run it BEFORE the clock starts.

---

I need a dataset to test (and optionally tune) an AI agent that reads garment care/content labels and sorts items for textile recycling. Find existing public datasets first (Kaggle, Hugging Face, Roboflow Universe, academic repositories, government or NGO textile-sorting projects). Only build or synthesize data if nothing usable exists.

**What each record needs**
1. An image of a garment, care label or content label (a file or a stable URL).
2. The text printed on the label, especially the fibre-content line (for example "60% cotton 40% polyester"). OCR text is fine if it is accurate.
3. Ground-truth tags if available: fibre type, garment type, colour, condition (wearable / damaged / unusable).

**Targets**
- At least 150 labelled records, ideally 500 or more.
- A mix: single-fibre, blends, denim, missing or unreadable labels, and a few labels where the label text and the garment appearance disagree.
- Real label photos preferred. Clean text-only records are acceptable as a second source.

**For each candidate dataset report**
- Name, URL, size, number of label images versus garment images.
- Licence and whether it allows use in a school hackathon project.
- Which fields it has (image, label text, fibre composition, colour, garment type, condition).
- Quality problems (blurry images, missing text, wrong labels).
- How to download it (Kaggle slug, direct link) and file format.

**Rank them** by how well they cover fibre-content text, then image quality, then licence. Recommend one primary source and one fallback. If you recommend building data yourself, say how (for example scraping product pages that show composition, or photographing labels) and what the licence risk is.

**Output** a short report plus a table. Do not invent datasets. If you cannot verify that a dataset exists, say so.

---

After the research: download the best set, then run
`python tools/ingest_dataset.py THE_FILE.csv --out data_big --limit 200`
to convert it into the test format. Rows without readable fibre text are expected to be held for a person, which is the correct behaviour.
