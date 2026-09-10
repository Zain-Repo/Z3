import type { CivitaiCheckpointRecommendation } from "@t3tools/contracts";

// Versions verified through Civitai's public model and version APIs on 2026-09-10.
// These are discovery shortcuts; account availability is checked again before generation.
export const CIVITAI_REALISTIC_CHECKPOINTS: readonly CivitaiCheckpointRecommendation[] = [
  {
    air: "urn:air:sdxl:checkpoint:civitai:166609@992946",
    name: "Realism By Stable Yogi (Pony)",
    versionName: "Pony_V3_VAE",
    baseModel: "Pony",
    trainedWords: [],
  },
  {
    air: "urn:air:sdxl:checkpoint:civitai:974693@2091367",
    name: "Realism Illustrious By Stable Yogi",
    versionName: "v5.0_FP16",
    baseModel: "Illustrious",
    trainedWords: [],
  },
  {
    air: "urn:air:sd1:checkpoint:civitai:4384@128713",
    name: "DreamShaper",
    versionName: "8",
    baseModel: "SD 1.5",
    trainedWords: [],
  },
  {
    air: "urn:air:sdxl:checkpoint:civitai:133005@1759168",
    name: "Juggernaut XL",
    versionName: "Ragnarok",
    baseModel: "SDXL 1.0",
    trainedWords: [],
  },
  {
    air: "urn:air:sdxl:checkpoint:civitai:312530@2840768",
    name: "CyberRealistic XL",
    versionName: "v10.0",
    baseModel: "SDXL 1.0",
    trainedWords: [],
  },
  {
    air: "urn:air:sdxl:checkpoint:civitai:277058@1522905",
    name: "epiCRealism XL",
    versionName: "VXVI - LastFAME (Realism++)",
    baseModel: "SDXL 1.0",
    trainedWords: [],
  },
  {
    air: "urn:air:sdxl:checkpoint:civitai:683210@1449179",
    name: "Photonic Fusion SDXL",
    versionName: "Finalé",
    baseModel: "SDXL 1.0",
    trainedWords: [],
  },
  {
    air: "urn:air:sdxl:checkpoint:civitai:443821@2884631",
    name: "CyberRealistic Pony",
    versionName: "v18.0 CoreShift",
    baseModel: "Pony",
    trainedWords: [],
  },
  {
    air: "urn:air:sd1:checkpoint:civitai:15003@2681234",
    name: "CyberRealistic",
    versionName: "Final",
    baseModel: "SD 1.5",
    trainedWords: [],
  },
];
