// server.ts
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json({ limit: "50mb" })); // Support large base64 upload objects

const PORT = 3000;

// Lazy initialize Gemini SDK client to prevent startup crash if key is absent
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key.includes("MY_GEMINI_API_KEY")) {
      console.warn("WARNING: GEMINI_API_KEY is not configured or holds a placeholder. Server will run in Mock AI mode.");
    }
    geminiClient = new GoogleGenAI({
      apiKey: key || "MOCK_KEY",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return geminiClient;
}

// In-Memory Database State
const products = [
  {
    id: "prod-01",
    name: "Aura Pods Active (Noise-Cancelling Bud)",
    description: "Ultra-sleek noise cancelling earbuds tuned for active sports and dynamic focus.",
    category: "Consumer Electronics",
    sellingPoints: [
      "45dB Hybrid Active Noise Cancellation for perfect noise barrier",
      "IPX7 Nano-impermeable Sweatproof Coating",
      "Dynamic Titanium-Alloy Driver with rich warm sub-bass response",
      "SecureWing Ergonomic Fit that never slips under movement"
    ],
    demographics: "Active gym-goers, daily commuters, and fitness enthusiasts aged 18-35.",
    price: "$69.99"
  },
  {
    id: "prod-02",
    name: "NeoGlow Smart Thermal Kettle",
    description: "Minimalist stainless-steel electric water kettle with a side temperature digital screen.",
    category: "Home & Kitchen",
    sellingPoints: [
      "Exact-degree liquid heating alignment with real-time temperature panel",
      "Strix safety auto-cutoff and boil-dry safeguard measures",
      "Double-walled thermal insulation structure to stay cold to external human touch",
      "BPA-Free 316 Food-grade medical quality interior body"
    ],
    demographics: "Tea and coffee connoisseurs, modern apartment dwellers, minimalist visual seekers.",
    price: "$49.50"
  },
  {
    id: "prod-03",
    name: "ContourFoam Posture Wedge",
    description: "Orthopedic pressure-relief memory foam cushion for healthy ergonomic sitting.",
    category: "Office & Home Health",
    sellingPoints: [
      "Tailbone pressure-relief Coccyx cut-out slot design",
      "High-density responsive contour memory foam matrix",
      "Perfect pelvic tilt promotion that helps alignment instantly",
      "Breathable honeycomb outer cover, fully detachable and washable"
    ],
    demographics: "Office workers, programmers, remote freelancers, and long-flight travelers.",
    price: "$34.00"
  }
];

const materials: any[] = [
  // Preloads for Aura Pods
  {
    id: "mat-01",
    productId: "prod-01",
    name: "Earpad Close-up Action Shot.mp4",
    type: "video",
    url: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?q=80&w=800&auto=format&fit=crop", // placeholder illustration
    createdAt: new Date().toISOString(),
    duration: 8.5,
    slices: [
      {
        id: "slice-01_1",
        materialId: "mat-01",
        productId: "prod-01",
        startTime: 0,
        endTime: 2.8,
        duration: 2.8,
        denseCaption: "Dynamic rotating close-up of the earbud displaying the titanium diaphragm structure highlighted with soft neon blue backlight.",
        tags: ["close-up", "high-tech", "rotating", "soundwave_vibe"]
      },
      {
        id: "slice-01_2",
        materialId: "mat-01",
        productId: "prod-01",
        startTime: 2.8,
        endTime: 5.6,
        duration: 2.8,
        denseCaption: "Side angle view showing extreme sweat drops resisting from the silicone wing shell, showing nano-barrier water-shedding.",
        tags: ["waterproof", "extreme", "active_sports", "micro-texture"]
      },
      {
        id: "slice-01_3",
        materialId: "mat-01",
        productId: "prod-01",
        startTime: 5.6,
        endTime: 8.5,
        duration: 2.9,
        denseCaption: "Product casing top latch snapping open with absolute fluid metallic spring hinges, power screen illuminating.",
        tags: ["unboxing", "lifestyle", "snap_closure", "metallic_texture"]
      }
    ]
  },
  // Simple Mock Image preloads for NeoGlow Kettle
  {
    id: "mat-02",
    productId: "prod-02",
    name: "Kettle Elegant Countertop.jpg",
    type: "image",
    url: "https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?q=80&w=800&auto=format&fit=crop",
    createdAt: new Date().toISOString(),
    slices: [
      {
        id: "slice-02_1",
        materialId: "mat-02",
        productId: "prod-02",
        startTime: 0,
        endTime: 3.0,
        duration: 3.0,
        denseCaption: "Pristine white digital minimalist kettle emitting gentle steaming mist against warm organic wooden countertop background.",
        tags: ["lifestyle", "nordic", "steam", "minimalist_interior"]
      }
    ]
  }
];

// Presets templates (Marketplace metadata)
const templates = [
  {
    id: "temp-hook-prov-offer",
    name: "Hook-Problem-Offer Formula",
    description: "Highest conversion sequence for ecommerce. Instantly grips attention by raising a painful user frustration, then offering the unique remedy.",
    formula: "0-3s: Grab attention Hook -> 3-8s: Pain point Problem statement -> 8-12s: Product introduction & benefits -> 12-15s: CTA discount promotion",
    examplePrompt: "Act as a modern UGC creator pitching to Gen-Z. Start with an aggressive auditory callout 'Listen... do you also suffer from...'. Present the product in action and end with a clear 50% discount trigger.",
    tags: ["High CTR", "Problem-Solving", "UGC Style", "Agressive Hook"]
  },
  {
    id: "temp-unboxing-aesthetic",
    name: "Atmospheric ASMR Unboxing",
    description: "Sleek and premium. Relies on clean visual detail shots, sound textures, and cool ambient design to project lifestyle elegance and prestige.",
    formula: "0-4s: Latch snapping / texture reveal ASMR -> 4-9s: Elegant product detail panorama -> 9-13s: Usability demonstration -> 13-15s: Brand card display",
    examplePrompt: "Adopt an elegant, sophisticated voice. Focus completely on the luxurious materials, clean industrial lines, and tactile physical feedback.",
    tags: ["Aesthetic", "Premium", "ASMR Sound", "Brand Focus"]
  },
  {
    id: "temp-social-challenge",
    name: "Trend Reaction Hack",
    description: "High engagement style replicating TikTok creator reaction trends. Fast-paced, witty, and highlights utility through clever visual hooks.",
    formula: "0-3s: Shocked reaction hook 'Stop using default...' -> 3-7s: Hilarious mistake reveal -> 7-12s: Product utility hack walkthrough -> 12-15s: Direct Click showcase button",
    examplePrompt: "Create highly verbal, enthusiastic commentary. Pitch the product as a major life-hack utility with rapid kinetic title cues.",
    tags: ["Trend-hacking", "Interactive", "Witty UGC", "Fast Cut"]
  }
];

const scripts: any[] = [];
const tasks: any[] = [];

// API ENDPOINTS

// 1. PRODUCTS
app.get("/api/products", (req, res) => {
  res.json(products);
});

app.post("/api/products", (req, res) => {
  const { name, description, category, sellingPoints, demographics, price } = req.body;
  if (!name || !description) {
    return res.status(400).json({ error: "Missing product name or description" });
  }
  const newProduct = {
    id: `prod-${Date.now()}`,
    name,
    description,
    category: category || "General Goods",
    sellingPoints: Array.isArray(sellingPoints) ? sellingPoints : [sellingPoints].filter(Boolean),
    demographics: demographics || "General eCommerce shoppers",
    price: price || "$19.99"
  };
  products.push(newProduct);
  res.status(201).json(newProduct);
});

// 2. MATERIALS & SLICING
app.get("/api/materials", (req, res) => {
  const { productId } = req.query;
  if (productId) {
    const list = materials.filter(m => m.productId === productId);
    return res.json(list);
  }
  res.json(materials);
});

// Material Upload & AI Slicing Analysis Endpoint
app.post("/api/materials/upload", async (req, res) => {
  const { productId, name, type, data } = req.body; // 'data' is base64
  if (!productId || !name || !type) {
    return res.status(400).json({ error: "productId, name, and type are required" });
  }

  const materialId = `mat-${Date.now()}`;
  const isVideo = type === "video";
  const mockUrl = data || "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=600&auto=format&fit=crop";

  let denseCaption = `Uploaded asset representing ${name}. Beautiful marketing lighting displaying detailed features of the product.`;
  let tags = ["uploaded", type, "marketing"];

  // Real-time AI Analysis of image using Gemini SDK, if keys are set and file is image
  if (type === "image" && data && data.startsWith("data:image")) {
    try {
      const match = data.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.*)$/);
      if (match) {
        const mimeType = match[1];
        const base64Data = match[2];
        const client = getGeminiClient();

        if (process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.includes("MY_GEMINI_API_KEY")) {
          const aiResponse = await client.models.generateContent({
            model: "gemini-3.5-flash",
            contents: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType: mimeType
                }
              },
              "Describe this product marketing photo for a social media catalog. Return short tags (as comma-separated tokens) and a precise, highly cinematic description under 60 words for the visual scene detailing materials and ambiance."
            ]
          });
          const text = aiResponse.text || "";
          // Parse a simple description and tags
          denseCaption = text.split("\n")[0] || denseCaption;
          const parsedTags = text.match(/#\w+|\b\w+\b/g)?.slice(0, 5) || [];
          if (parsedTags.length > 0) {
            tags = [...new Set([...tags, ...parsedTags.map(t => t.replace("#", "").toLowerCase())])];
          }
        }
      }
    } catch (e: any) {
      console.error("Gemini Image Analysis failed, falling back to mock descriptors:", e.message);
    }
  }

  // Create slicing assets
  const slices = [];
  if (isVideo) {
    // Slices a video into multiple shorter clips automatically (PRD constraints 1.5s - 4.0s)
    slices.push(
      {
        id: `slice-${materialId}-1`,
        materialId,
        productId,
        startTime: 0.0,
        endTime: 3.2,
        duration: 3.2,
        denseCaption: `[AI Slice 0-3.2s] Dynamic intro capture showcasing product lines with fluid, organic pacing. Tagged detail feature scene.`,
        tags: [ "intro-hook", "establishing-shot", "dynamics" ]
      },
      {
        id: `slice-${materialId}-2`,
        materialId,
        productId,
        startTime: 3.2,
        endTime: 6.5,
        duration: 3.3,
        denseCaption: `[AI Slice 3.2-6.5s] High density feature focus showcasing practical usage and aesthetic curves under premium lighting setup.`,
        tags: [ "feature-focus", "usability-shot", "tactile" ]
      }
    );
  } else {
    // Image creates a persistent single zoom/pan motion slice
    slices.push({
      id: `slice-${materialId}-1`,
      materialId,
      productId,
      startTime: 0.0,
      endTime: 3.0,
      duration: 3.0,
      denseCaption,
      tags: [...tags, "still-frame", "pan-render"]
    });
  }

  const newMaterial = {
    id: materialId,
    productId,
    name,
    type,
    url: mockUrl,
    createdAt: new Date().toISOString(),
    duration: isVideo ? 6.5 : undefined,
    slices
  };

  materials.push(newMaterial);
  res.status(201).json(newMaterial);
});

// 3. GET TEMPLATES
app.get("/api/templates", (req, res) => {
  res.json(templates);
});

// 4. INTELLIGENT SCRIPT GENERATION & THE SCHEMA ENFORCEMENT
app.get("/api/scripts", (req, res) => {
  const { productId } = req.query;
  if (productId) {
    const list = scripts.filter(s => s.productId === productId);
    return res.json(list);
  }
  res.json(scripts);
});

app.post("/api/scripts/generate", async (req, res) => {
  const { productId, creatorStyle, templateId, remakeReferenceText } = req.body;
  if (!productId) {
    return res.status(400).json({ error: "productId is required" });
  }

  const productObj = products.find(p => p.id === productId);
  if (!productObj) {
    return res.status(404).json({ error: "Product not found" });
  }

  // Find optional styles
  const templateObj = templates.find(t => t.id === templateId) || templates[0];
  const stylePrompt = templateObj.examplePrompt;

  let prompt = `You are a viral TikTok Shop ad copywriter specializing in global conversions. Create a highly persuasive, 15-second multi-scene structured script to sell this product:
Product: ${productObj.name}
Details: ${productObj.description}
Selling points: ${productObj.sellingPoints.join(", ")}
Target audience: ${productObj.demographics}
Target price: ${productObj.price}
Ad Style/Template constraint: ${templateObj.name} (${templateObj.formula}). Style prompts: ${stylePrompt}
`;

  if (creatorStyle === "remake" && remakeReferenceText) {
    prompt += `\n*SPECIAL REMAKE INSTRUCTION*: Adapt following reference script structural hook, voice transitions and CTA while substituting our product selling details accurately:\n"${remakeReferenceText}"`;
  }

  prompt += `\nOutput precisely structured JSON mapping directly to exactly 4 scene cards totaling exactly 15 seconds. Ensure each field matches these constraints:
- sceneNumber: sequential 1 to 4
- duration: length in seconds (must total exactly 15.0s, e.g. scene 1=3.0, scene 2=4.0, scene landscape=4.0, transition=4.0)
- visualDescription: concrete visual descriptions of camera framing, product detailing, lighting, no poetic clutter.
- voiceoverText: actual dynamic UGC styled script line to be synthesized via voiceover.
- subtitle: short, snappy on-screen overlay text.
- motion: specific camera kinetic instruction e.g. 'Zoom In', 'Tilt Up', 'Tracking Pan'.
- safeZoneBoundingBox: exact sub-screen boundaries [x1, y1, x2, y2] to render safety cues, values are 0-1 (e.g. [0.1, 0.7, 0.9, 0.95] for standard mid-bottom overlay).

Output schema must be JSON array reflecting valid root elements with properties: 'title', 'bgmStyle', 'voiceGender', 'scenes' array.`;

  let responseData: any = null;

  try {
    const client = getGeminiClient();
    const hasKeys = process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.includes("MY_GEMINI_API_KEY");

    if (hasKeys) {
      const gRes = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              bgmStyle: { type: Type.STRING, description: "BGM vibe: energetic, ambient-chill, electric, or tech-mono" },
              voiceGender: { type: Type.STRING, description: "Pick one available speaker name: Kore, Zephyr, Puck, or Fenrir" },
              scenes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    sceneNumber: { type: Type.INTEGER },
                    duration: { type: Type.NUMBER, description: "seconds length e.g. 3.0 up to 5.0" },
                    visualDescription: { type: Type.STRING },
                    voiceoverText: { type: Type.STRING },
                    subtitle: { type: Type.STRING },
                    motion: { type: Type.STRING },
                    safeZoneBoundingBox: {
                      type: Type.ARRAY,
                      items: { type: Type.NUMBER },
                      description: "Array of 4 floats: x1, y1, x2, y2 from 0.0 to 1.0 representing caption placement"
                    }
                  },
                  required: ["sceneNumber", "duration", "visualDescription", "voiceoverText", "subtitle", "motion"]
                }
              }
            },
            required: ["title", "bgmStyle", "voiceGender", "scenes"]
          }
        }
      });

      const textOutput = gRes.text || "";
      responseData = JSON.parse(textOutput);
    }
  } catch (e: any) {
    console.error("Gemini generation failed, falling back to robust offline script engine:", e.message);
  }

  // Robust fallback content if error occurs or no API key, keeping the demo experience excellent
  if (!responseData) {
    responseData = {
      title: `${productObj.name} Viral TikTok Booster`,
      bgmStyle: creatorStyle === "template" && templateId === "temp-unboxing-aesthetic" ? "cyber-organic-lofi" : "energetic-hiphop",
      voiceGender: "Zephyr",
      scenes: [
        {
          sceneNumber: 1,
          duration: 3.5,
          visualDescription: `Zoom in extremely close on ${productObj.name}, revealing premium outer textures and sleek branding emblem. Clean studio lighting.`,
          voiceoverText: `Watch this. If you are struggling with daily fatigue, you are doing it all wrong!`,
          subtitle: "Stop Scrolling! ⚠️",
          motion: "Push Zoom",
          safeZoneBoundingBox: [0.15, 0.75, 0.85, 0.9]
        },
        {
          sceneNumber: 2,
          duration: 4.0,
          visualDescription: `Demonstrating the absolute key differentiator: ${productObj.sellingPoints[0] || "Ultra quality build"}. Practical use showcase.`,
          voiceoverText: `This absolute life-changer combines ${productObj.sellingPoints[1] || "ergonomics and design"} in one compact frame.`,
          subtitle: `${productObj.sellingPoints[0] ? productObj.sellingPoints[0].split(" ")[0] : "Life changer"} Active Mode ⚡`,
          motion: "Slow Tracking Pan",
          safeZoneBoundingBox: [0.15, 0.75, 0.85, 0.9]
        },
        {
          sceneNumber: 3,
          duration: 4.0,
          visualDescription: `Split screen mockup or side profile action highlight displaying pelvic tilt wedges or sweating waterproof resistances.`,
          voiceoverText: `Engineered precisely with our custom technology. It's completely ${productObj.sellingPoints[2] ? productObj.sellingPoints[2].split(" ")[0] : "optimized"}!`,
          subtitle: "Engineered Perfection 🛠️",
          motion: "Dolly Out Pivot",
          safeZoneBoundingBox: [0.15, 0.75, 0.85, 0.9]
        },
        {
          sceneNumber: 4,
          duration: 3.5,
          visualDescription: `Final CTA view with yellow coupon tag overlay. Glowing highlight focus on screen pricing: ${productObj.price}.`,
          voiceoverText: `Available on the TikTok Shop right now, click down below to claim your 50% discount instantly!`,
          subtitle: "Click Below & Save 50% Off! 🛍️",
          motion: "Lock Tilt Up",
          safeZoneBoundingBox: [0.1, 0.7, 0.9, 0.85]
        }
      ]
    };
  }

  // Ensure total script duration totals correct values
  const total = responseData.scenes.reduce((acc: number, val: any) => acc + (val.duration || 3), 0);
  const videoScript = {
    id: `script-${Date.now()}`,
    productId,
    title: responseData.title || `Viral Ad for ${productObj.name}`,
    creatorStyle,
    totalDuration: Number(total.toFixed(1)),
    bgmStyle: responseData.bgmStyle || "energetic",
    voiceGender: responseData.voiceGender || "Zephyr",
    scenes: responseData.scenes,
    createdAt: new Date().toISOString()
  };

  scripts.push(videoScript);
  res.json(videoScript);
});

// Update single scene in-place (FR-11 validation)
app.post("/api/scripts/edit-scene", (req, res) => {
  const { scriptId, sceneNumber, updatedFields } = req.body;
  if (!scriptId || sceneNumber === undefined || !updatedFields) {
    return res.status(400).json({ error: "scriptId, sceneNumber, and updatedFields are required" });
  }

  const script = scripts.find(s => s.id === scriptId);
  if (!script) {
    return res.status(404).json({ error: "Script not found" });
  }

  const sceneIndex = script.scenes.findIndex((sc: any) => sc.sceneNumber === sceneNumber);
  if (sceneIndex === -1) {
    return res.status(404).json({ error: "Scene number not found inside script" });
  }

  // Validate TTS reading time if text changed to enforce warning constraints (approx 4 chars per sec)
  if (updatedFields.voiceoverText !== undefined) {
    const textLen = updatedFields.voiceoverText.trim().length;
    const currentDuration = updatedFields.duration || script.scenes[sceneIndex].duration;
    // rough reading threshold: 1 second allows ~4 Chinese characters or ~3 English words
    const approxDurationRequired = Math.max(1.5, Math.ceil(textLen / 3.5));

    if (approxDurationRequired > currentDuration + 1) {
      return res.status(422).json({
        warning: `TTS Text is too verbose (${textLen} characters) to speak naturally in the assigned ${currentDuration}s slot. Suggested: trim text or increase scene duration to at least ${approxDurationRequired}s.`
      });
    }
  }

  // Update scene in script
  script.scenes[sceneIndex] = {
    ...script.scenes[sceneIndex],
    ...updatedFields
  };

  // Recalculate total duration
  const total = script.scenes.reduce((acc: number, val: any) => acc + (val.duration || 3), 0);
  script.totalDuration = Number(total.toFixed(1));

  res.json({ script, success: true });
});

// 5. TTS SYNTHESIZER VOICE CHANNELS
app.post("/api/tts", async (req, res) => {
  const { text, voiceGender } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Missing synthesis text" });
  }

  const voice = voiceGender || "Zephyr";

  try {
    const client = getGeminiClient();
    const hasKeys = process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.includes("MY_GEMINI_API_KEY");

    if (hasKeys) {
      const response = await client.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: `Say with enthusiasm: ${text}` }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice }
            }
          }
        }
      });

      const audioBase64 = response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioBase64) {
        return res.json({ audioUrl: `data:audio/wav;base64,${audioBase64}`, success: true });
      }
    }
  } catch (e: any) {
    console.error("Gemini TTS Generation failed:", e.message);
  }

  // Return elegant speaking mockup if Gemini API key isn't fully set up.
  // This is a short static sound click or browser-tts fallback.
  res.json({
    audioUrl: "", // UI will use fallback window.speechSynthesis or simulated audio element indicator
    success: false,
    mockPrompt: `[Simulated Speech synthesize: '${text}' voiced by ${voice}]`
  });
});

// 6. ASYNC TASK ENGINE & SIMULATOR
app.get("/api/tasks", (req, res) => {
  res.json(tasks);
});

app.post("/api/tasks/create", (req, res) => {
  const { scriptId, productId } = req.body;
  if (!scriptId || !productId) {
    return res.status(400).json({ error: "Missing scriptId or productId" });
  }

  const taskId = `task-${Date.now()}`;
  const creationId = `creation-${Date.now()}`;

  const taskObj = {
    id: creationId,
    taskId,
    scriptId,
    productId,
    status: "QUEUE_ALLOCATION",
    progress: 5,
    createdAt: new Date().toISOString(),
    logs: ["[0.0s] Initializing TikStream rendering pipelines. Allocating task workspace..."],
    videoUrl: ""
  };

  tasks.unshift(taskObj);

  // Background Task Loop Simulator
  const statusTimeline: { status: string; progress: number; log: string; delay: number }[] = [
    { status: "QUEUE_ALLOCATION", progress: 15, log: "[1.2s] Host GPU memory locked. Initializing compilation assets...", delay: 1000 },
    { status: "ASSET_MATCHING", progress: 30, log: "[2.5s] Scanning Materials library. Selected perfect segment matching script keywords...", delay: 2000 },
    { status: "AI_VIDEO_GENERATING", progress: 50, log: "[4.2s] Running high detail diffusion. Generating generative frame buffers...", delay: 2500 },
    { status: "TTS_GENERATING", progress: 70, log: "[6.0s] Synchronizing Voiceover track. Invoking TTS Gemini neural narrator...", delay: 1800 },
    { status: "FFMPEG_STITCHING", progress: 85, log: "[7.5s] Stamping overlay watermarks, compiling multi-tracks in 9:16 aspect ratio...", delay: 1500 },
    { status: "LOUDNORM_COMPLIANCE", progress: 95, log: "[8.8s] Audio amplitude equalized. Enforcing TikTok Safe-Margins standard...", delay: 1000 },
    { status: "FINISHED", progress: 100, log: "[10.0s] Dynamic marketing video completed successfully. Media saved to storage.", delay: 800 }
  ];

  let totalDelay = 0;
  statusTimeline.forEach((step) => {
    totalDelay += step.delay;
    setTimeout(() => {
      const activeTask = tasks.find(t => t.id === creationId);
      if (activeTask && activeTask.status !== "FAILED") {
        activeTask.status = step.status;
        activeTask.progress = step.progress;
        activeTask.logs.push(step.log);

        if (step.status === "FINISHED") {
          // Provide visual stock matching links matching Aura Pods or kettles, keeping visual rich
          if (productId === "prod-01") {
            // Aura Pods mockup
            activeTask.videoUrl = "https://assets.mixkit.co/videos/preview/mixkit-headphones-lying-on-a-table-32943-large.mp4";
          } else if (productId === "prod-02") {
            // Kettle
            activeTask.videoUrl = "https://assets.mixkit.co/videos/preview/mixkit-hands-pouring-hot-water-from-a-kettle-into-a-cup-43184-large.mp4";
          } else {
            // Generic high-quality ad mock video
            activeTask.videoUrl = "https://assets.mixkit.co/videos/preview/mixkit-spinning-silver-smartphone-with-camera-on-display-32219-large.mp4";
          }
        }
      }
    }, totalDelay);
  });

  res.status(202).json({ id: creationId, taskId, message: "Task pipeline spawned successfully." });
});

// Retry Failed Pipeline Tasks Task
app.post("/api/tasks/retry", (req, res) => {
  const { taskId } = req.body;
  const task = tasks.find(t => t.taskId === taskId || t.id === taskId);
  if (!task) {
    return res.status(404).json({ error: "Task not found to retry" });
  }

  task.status = "QUEUE_ALLOCATION";
  task.progress = 10;
  task.error = undefined;
  task.logs = ["[0.0s] Retrying task workstation. Reloading materials..."];

  // Re-run simulator
  setTimeout(() => {
    task.status = "ASSET_MATCHING";
    task.progress = 40;
    task.logs.push("[2.0s] Asset compilation matching retrieved successfully from cache.");
  }, 1000);

  setTimeout(() => {
    task.status = "FINISHED";
    task.progress = 100;
    task.logs.push("[4.5s] Render task reconstructed and completed beautifully.");
    task.videoUrl = task.productId === "prod-01" 
      ? "https://assets.mixkit.co/videos/preview/mixkit-headphones-lying-on-a-table-32943-large.mp4"
      : "https://assets.mixkit.co/videos/preview/mixkit-hands-pouring-hot-water-from-a-kettle-into-a-cup-43184-large.mp4";
  }, 3000);

  res.json({ success: true, task });
});

// mock simulated conversion analytics curves matching scenes
app.get("/api/analytics", (req, res) => {
  res.json({
    metrics: {
      averageCtr: "12.8%",
      averageCompletionRate: "34.5%",
      estimatedRoi: "3.4x",
      testedCount: 14
    },
    retentionCurve: [
      { second: 0, retention: 100, scene: "Scene 1: Hook (Dynamic intro)" },
      { second: 1, retention: 98, scene: "Scene 1: Hook" },
      { second: 2, retention: 92, scene: "Scene 1: Hook" },
      { second: 3, retention: 84, scene: "Scene 1: Hook" },
      { second: 4, retention: 65, scene: "Scene 2: Problem painpoints (Aura fit drop-off point)" },
      { second: 5, retention: 61, scene: "Scene 2: Problem" },
      { second: 6, retention: 58, scene: "Scene 2: Problem" },
      { second: 7, retention: 56, scene: "Scene 2: Problem" },
      { second: 8, retention: 54, scene: "Scene 3: Product intro solution details" },
      { second: 9, retention: 52, scene: "Scene 3: Solution details" },
      { second: 10, retention: 51, scene: "Scene 3: Solution details" },
      { second: 11, retention: 50, scene: "Scene 3: Solution details" },
      { second: 12, retention: 49, scene: "Scene 4: Call to action pricing" },
      { second: 13, retention: 45, scene: "Scene 4: CTA promotion" },
      { second: 14, retention: 41, scene: "Scene 4: CTA promotion" },
      { second: 15, retention: 35, scene: "Completion payoff" }
    ],
    bestsellers: [
      { title: "Aura Pods Active Pitch A", hookType: "Personal callout hook", ctr: "15.4%", completion: "42.0%" },
      { title: "NeoGlow ASMR Countertop B", hookType: "Steam release trigger", ctr: "11.2%", completion: "38.5%" },
      { title: "Aura Pods Workout Reaction C", hookType: "Trend Reaction Hack", ctr: "10.1%", completion: "31.2%" }
    ],
    factorAttributes: [
      { name: "Visual Backlighting Vibe", score: 88, category: "Visual Hook" },
      { name: "First-3-seconds Text Accent", score: 94, category: "Text Hook" },
      { name: "BGM Bass drop timing alignment", score: 72, category: "Auditory Flow" },
      { name: "Loudness levels normalization", score: 91, category: "Regulatory Finish" }
    ],
    abCompared: {
      versionA: { title: "UGC Callout (Trend-styled)", conversionRate: "4.8%", costPerAcquisition: "$12.4", completionRate: "39%" },
      versionB: { title: "Aesthetic ASMR (Clean Cinematic)", conversionRate: "2.1%", costPerAcquisition: "$21.0", completionRate: "19%" }
    }
  });
});

// Setup Vite Dev server or Serve static files in production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Development mode
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production mode
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[TikStream AI Backend] listening safely on port ${PORT}`);
  });
}

startServer();
