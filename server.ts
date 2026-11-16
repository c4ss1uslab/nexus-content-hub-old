import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import ogs from "open-graph-scraper";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const urlRequestTimestamps = new Map<string, number>();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.post("/api/generate-tags", async (req, res) => {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: "items array is required" });
    }

    try {
      const prompt = `Based on the following list of web resources (titles and descriptions), generate 2 to 5 highly relevant topics or tag labels for each resource. The tags should be short, lowercase, and relevant to the topics discussed (e.g., "tech", "web3", "ai", "productivity", "economics", "wellness", "learning").
Input resources:
${items.map((item, idx) => `[Item ${idx}] Title: "${item.title}" | Description: "${item.description || ''}"`).join('\n')}

Output your response ONLY as a JSON array of string arrays (where each item gets its own string array of tags), matching the order of the inputs.
Example format:
[
  ["ai", "development", "tools"],
  ["mindfulness", "health"]
]
Only return a valid JSON array, do not wrap it in \`\`\`json or include helper descriptions.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      let responseText = response.text || "";
      responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      
      const parsedTags = JSON.parse(responseText);
      res.json({ tags: parsedTags });
    } catch (error) {
      console.error("Gemini tags error:", error);
      const fallbacks = items.map(() => ["curated", "node"]);
      res.json({ tags: fallbacks });
    }
  });

  app.post("/api/categorize-tag", async (req, res) => {
    const { tag } = req.body;
    if (!tag) {
      return res.status(400).json({ error: "Tag is required" });
    }

    try {
      const prompt = `You are a categorizer. Categorize the tag "${tag}" into exactly ONE of the following categories, and output only the exact category name in UPPERCASE text (no quotes, no other text):
ALCHEMY
PLAYER
RESEARCH
DESIGN
HOST
ATHLETE
LOG
AI
MUSIC
ART
REGEN
LAB

Example heuristics:
metacrisis, sensemaking, science, complexity -> RESEARCH
wisdom, spirituality -> ALCHEMY
economics, governance, coordination, systems, mapping -> DESIGN
bioregional -> REGEN
visualization, knowledge management, tools for thought -> LAB
AI -> AI
facilitation, decolonial, indigenous, quilombola -> HOST

Output ONLY the category name.`;
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      const category = response.text?.trim().toUpperCase() || "LOG";
      res.json({ category });
    } catch (error) {
      console.error("Gemini error:", error);
      res.json({ category: "LOG" }); // Fallback
    }
  });

  // API Route for URL Metadata extraction
  app.post("/api/extract-metadata", async (req, res) => {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    try {
      const options = { 
        url,
        timeout: 10000,
        fetchOptions: {
          headers: {
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
          }
        }
      };
      
      let forceFallback = false;
      const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
      if (isYouTube) {
        forceFallback = true;
        console.log(`YouTube link detected: forcing LinkPreview as standard social preview option.`);
      }

      const now = Date.now();
      if (urlRequestTimestamps.has(url)) {
        const prevTime = urlRequestTimestamps.get(url)!;
        if (now - prevTime < 60000) { // 60 seconds (clicked twice quickly)
          forceFallback = true;
          console.log(`URL ${url} requested twice within 60s. Bypassing OGS to force LinkPreview fallback.`);
        }
      }
      urlRequestTimestamps.set(url, now);

      let extractionOk = false;
      let title = "";
      let description = "";
      let image = "";
      let siteName = "";
      let type = "website";
      let author = "";

      if (!forceFallback) {
        try {
          const { result } = await ogs(options);
          title = result.ogTitle || result.twitterTitle || result.dcTitle || "";
          description = result.ogDescription || result.twitterDescription || result.dcDescription || "";
          image = result.ogImage?.[0]?.url || 
                  result.twitterImage?.[0]?.url || 
                  (result as any).ogImageProperty || 
                  "";
          siteName = result.ogSiteName || result.twitterSite || "";
          type = result.ogType || "website";
          author = (result as any).articleAuthor || (result as any).ogArticleAuthor || (result as any).twitterCreator || (result as any).author || "";
          
          if (title) extractionOk = true;
        } catch (ogsError) {
          console.warn("OGS extraction failed, will attempt fallback:", ogsError);
        }
      }

      // Fallback with linkpreview
      if (!extractionOk) {
        try {
          const lpRes = await fetch(`https://api.linkpreview.net/?key=95c40e3ff8f2ada78bbbc9920d0b1332&q=${encodeURIComponent(url)}`);
          if (lpRes.ok) {
            const lpData: any = await lpRes.json();
            title = lpData.title || title;
            description = lpData.description || description;
            image = lpData.image || image;
            author = lpData.author || author || "";
            extractionOk = !!title;
            try {
              siteName = siteName || new URL(url).hostname;
            } catch (pE) {
              siteName = siteName || "";
            }
            console.log("LinkPreview fallback succeeded!", lpData);
          }
        } catch (lpError) {
          console.error("LinkPreview fallback failed:", lpError);
        }
      }

      // YouTube specific fallback
      if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
        const videoId = url.includes('watch') 
          ? new URL(url).searchParams.get('v') 
          : url.split('/').pop();
          
        if (videoId) {
          if (!image) image = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
          
          try {
            const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
            const oembedRes = await fetch(oembedUrl);
            if (oembedRes.ok) {
              const oembedData = await oembedRes.json();
              if (oembedData && oembedData.title) {
                title = title || oembedData.title;
                author = oembedData.author_name || author || "";
              }
            }
          } catch (e) {
             console.error("YouTube oEmbed error:", e);
          }
          
          // If title still empty after ogs and oembed, fallback
          if (!title || title === "YouTube") title = "YouTube Video Node"; 
        }
      }

      res.json({
        title: title || "Scraped Resource Node",
        description: description,
        image: image,
        siteName: siteName || (url ? new URL(url).hostname : ""),
        type: type,
        author: author
      });
    } catch (error) {
      console.error("Scraping error:", error);
      res.status(500).json({ error: "Failed to extract metadata" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
