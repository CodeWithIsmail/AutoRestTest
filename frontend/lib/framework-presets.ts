export interface FrameworkPreset {
  id: string;
  name: string;
  directories: string[];
}

export const FRAMEWORK_PRESETS: FrameworkPreset[] = [
  {
    id: "default",
    name: "General / Default",
    directories: [
      "node_modules",
      "dist",
      "build",
      "coverage",
      "venv",
      "__pycache__",
    ],
  },
  {
    id: "nodejs",
    name: "Node.js (Express, NestJS, Next.js)",
    directories: ["node_modules", "dist", "build", "coverage", ".next", "out"],
  },
  {
    id: "python",
    name: "Python (FastAPI, Flask, Django)",
    directories: [
      "venv",
      ".venv",
      "env",
      "__pycache__",
      ".pytest_cache",
      "dist",
      "build",
    ],
  },
  {
    id: "java",
    name: "Java / Kotlin (Spring Boot, Gradle, Maven)",
    directories: ["target", "build", ".gradle", ".mvn", "bin", "out"],
  },
  {
    id: "go",
    name: "Go (Gin, Fiber, Echo)",
    directories: ["vendor", "bin", "pkg"],
  },
  {
    id: "dotnet",
    name: "C# / .NET (ASP.NET Core)",
    directories: ["bin", "obj", "TestResults", "packages"],
  },
  {
    id: "php",
    name: "PHP (Laravel, Symfony)",
    directories: ["vendor", "storage", "bootstrap/cache"],
  },
  {
    id: "ruby",
    name: "Ruby (Rails, Sinatra)",
    directories: ["vendor", "log", "tmp", ".bundle"],
  },
  {
    id: "rust",
    name: "Rust (Actix-web, Axum)",
    directories: ["target"],
  },
  {
    id: "custom",
    name: "Custom / Blank",
    directories: [],
  },
];

export const DEFAULT_PRESET_ID = "default";

export function getPresetById(id: string): FrameworkPreset | undefined {
  return FRAMEWORK_PRESETS.find((p) => p.id === id);
}
