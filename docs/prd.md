Document Status: MVP Draft v1.0
Project Lead: LeoLogic CTO / Lead AI Orchestrator
App Category: Health & Fitness (Non-Medical)

1. High-Level Vision
"Half-Life" is a personal bio-state tracking application. It shifts the paradigm from "What did I consume?" (calorie counting) to "What is my current biological state?" (real-time energy, sleep readiness, and hydration levels). It empowers users to optimize their productivity and fitness routines through intuitive visualizations of substance metabolism.

2. Core Modules (The Engines)
The Stimulant Engine (Caffeine):

Logic: Predicts current active caffeine levels using first-order decay kinetics.

Output: "Sleep Readiness Score" and "Time until system clear."

The Glycemic Engine (Sugar/Carbs):

Logic: Models the post-consumption glucose spike and subsequent energy crash.

Output: "Energy Peak Duration" and "Crash Warning Timer."

The Hydration & Pump Engine (Sodium):

Logic: Tracks cumulative daily sodium intake against user-defined goals.

Output: Readiness for training (pump optimization) and water retention warnings.

3. Personalization & Safety (Bio-Profile)
Allergy Gatekeeper: Hard block and visual warnings if a user attempts to log a substance containing an allergen (e.g., caffeine sensitivity, specific artificial sweeteners).

Metabolic Multipliers: Users can self-identify as "Fast" or "Slow" metabolizers, which adjusts the decay constants in the underlying algorithms.

4. Technical Architecture & Constraints (Cursor / Vibe Code Ready)
Framework: React Native with Expo (Managed Workflow for rapid prototyping).

Styling: NativeWind (Tailwind CSS for React Native) to ensure fast UI iteration.

Storage: Local-first approach using AsyncStorage or WatermelonDB. No backend required for MVP (ensures total data privacy and zero server costs).

State Management: Zustand (lightweight and fast).

5. Monetization Strategy
Freemium Model: Standard caffeine tracking is free.

Pro Tier (In-App Purchase/Subscription): Unlocks Sugar/Sodium tracking, custom metabolic tuning, and Apple Health / Google Fit integration.