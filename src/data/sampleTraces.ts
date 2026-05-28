import type { ReasonTrace } from "../types";

export const sampleTraces: Record<string, ReasonTrace> = {
  "arc-agi-solver": {
    "title": "ARC-AGI Solver Failure: Spurious Symmetry Hypothesis",
    "events": [
      {
        "id": "e1",
        "type": "hypothesis",
        "step": 1,
        "content": "The grid transformation rule requires vertical axis reflection symmetry across the centerline.",
        "confidence": 0.85,
        "links": []
      },
      {
        "id": "e2",
        "type": "action",
        "step": 2,
        "content": "Apply horizontal flip operation to training input grids.",
        "tool": "grid_transform",
        "links": ["e1"]
      },
      {
        "id": "e3",
        "type": "observation",
        "step": 3,
        "content": "Transformation matches training outputs for 4 out of 6 grids, but fails on 2 grids with partial mismatches.",
        "links": ["e2"]
      },
      {
        "id": "e4",
        "type": "belief_update",
        "step": 4,
        "content": "Symmetry is likely the primary rule; the 2 failures might represent noise or a minor sub-rule. Retain symmetry hypothesis.",
        "confidence": 0.80,
        "links": ["e1", "e3"]
      },
      {
        "id": "e5",
        "type": "action",
        "step": 5,
        "content": "Apply horizontal flip transformation to the test input grid.",
        "tool": "grid_transform",
        "links": ["e4"]
      },
      {
        "id": "e6",
        "type": "observation",
        "step": 6,
        "content": "Execution on test grid results in mismatch warning in verification system.",
        "links": ["e5"]
      },
      {
        "id": "e7",
        "type": "failure",
        "step": 7,
        "content": "Loop/Spurious Commitment: The solver applied the horizontal flip to the test input despite knowing it failed on training samples. Fails to update hypothesis based on training mismatches.",
        "links": ["e4", "e6"]
      },
      {
        "id": "e8",
        "type": "hypothesis",
        "step": 8,
        "content": "Symmetry is incorrect. The 2 failing grids contain different counts of red squares. Maybe the output size and shape is scaled by the count of red objects.",
        "confidence": 0.90,
        "links": ["e7"]
      },
      {
        "id": "e9",
        "type": "action",
        "step": 9,
        "content": "Run object detection and count red pixels in all training inputs.",
        "tool": "object_count",
        "links": ["e8"]
      },
      {
        "id": "e10",
        "type": "observation",
        "step": 10,
        "content": "Count of red squares: Grid 1 has 3, Grid 2 has 3, Grid 3 has 5, Grid 4 has 5, Grid 5 has 2, Grid 6 has 2. Output sizes perfectly match these numbers (3x3, 3x3, 5x5, 5x5, 2x2, 2x2).",
        "links": ["e9"]
      },
      {
        "id": "e11",
        "type": "belief_update",
        "step": 11,
        "content": "Strong confidence update: The transformation scales the output bounding box to N x N where N is the count of red objects, discarding the symmetry assumption entirely.",
        "confidence": 0.99,
        "links": ["e8", "e10"]
      },
      {
        "id": "e12",
        "type": "final_answer",
        "step": 12,
        "content": "Scale the output grid dimensions to match the number of red objects, and fill with the target color pattern.",
        "links": ["e11"]
      }
    ]
  },
  "code-debugger": {
    "title": "Code Debugger: Parser Loop Boundary",
    "events": [
      {
        "id": "e1",
        "type": "hypothesis",
        "step": 1,
        "content": "The parser bug is likely caused by an off-by-one error in the lexical analyzer boundary checking.",
        "confidence": 0.62,
        "links": []
      },
      {
        "id": "e2",
        "type": "action",
        "step": 2,
        "content": "Inspect loop boundary in parser.ts around token reading logic.",
        "tool": "file_read",
        "links": ["e1"]
      },
      {
        "id": "e3",
        "type": "observation",
        "step": 3,
        "content": "The loop uses `for (let i = 0; i <= tokens.length; i++)` which attempts to access `tokens[tokens.length]` resulting in `undefined`.",
        "links": ["e2"]
      },
      {
        "id": "e4",
        "type": "belief_update",
        "step": 4,
        "content": "The off-by-one hypothesis is strongly supported. Accessing indices beyond length throws an index boundary error.",
        "confidence": 0.91,
        "links": ["e1", "e3"]
      },
      {
        "id": "e5",
        "type": "action",
        "step": 5,
        "content": "Run parser unit test suite with boundary changed to `< tokens.length`.",
        "tool": "terminal_exec",
        "links": ["e4"]
      },
      {
        "id": "e6",
        "type": "observation",
        "step": 6,
        "content": "All 18 parser test cases passed successfully without exceptions.",
        "links": ["e5"]
      },
      {
        "id": "e7",
        "type": "final_answer",
        "step": 7,
        "content": "Change `<=' to `<' in parser loop on line 124 of `parser.ts` to prevent index out of bounds.",
        "links": ["e4", "e6"]
      }
    ]
  },
  "rope-scaling": {
    "title": "AI Research: Context Window Extension (RoPE Scaling)",
    "events": [
      {
        "id": "e1",
        "type": "hypothesis",
        "step": 1,
        "content": "Applying a rotary position embedding scaling factor (NTK-aware interpolation) will maintain accuracy at 128k context without fine-tuning.",
        "confidence": 0.70,
        "links": []
      },
      {
        "id": "e2",
        "type": "action",
        "step": 2,
        "content": "Implement NTK-aware RoPE scaling in the model configuration.",
        "tool": "config_edit",
        "links": ["e1"]
      },
      {
        "id": "e3",
        "type": "observation",
        "step": 3,
        "content": "Evaluation perplexity on 32k context is 8.41, but spikes to 42.15 on 64k and NaN on 128k.",
        "links": ["e2"]
      },
      {
        "id": "e4",
        "type": "belief_update",
        "step": 4,
        "content": "The naive NTK scaling is insufficient. The high-frequency dimensions are losing representation accuracy under large scales.",
        "confidence": 0.25,
        "links": ["e1", "e3"]
      },
      {
        "id": "e5",
        "type": "decision",
        "step": 5,
        "content": "Choose between YaRN (Yet another RoPE extensioN) and standard linear interpolation.",
        "links": ["e4"]
      },
      {
        "id": "e6",
        "type": "action",
        "step": 6,
        "content": "Implement YaRN scaling factors and re-run perplexity tests.",
        "tool": "python_eval",
        "links": ["e5"]
      },
      {
        "id": "e7",
        "type": "observation",
        "step": 7,
        "content": "YaRN results in perplexity of 8.65 at 32k, 9.12 at 64k, and 10.35 at 128k context.",
        "links": ["e6"]
      },
      {
        "id": "e8",
        "type": "belief_update",
        "step": 8,
        "content": "YaRN scaling successfully stabilizes the attention entropy. Interpolating high-frequencies less and low-frequencies more resolves the context limit spike.",
        "confidence": 0.92,
        "links": ["e6", "e7"]
      },
      {
        "id": "e9",
        "type": "final_answer",
        "step": 9,
        "content": "Deploy NTK-YaRN interpolation with base multiplier 10000 and scale factor 4.0 for production models.",
        "links": ["e8"]
      }
    ]
  },
  "flight-booker": {
    "title": "Web Agent: Flight Booking Modal Trap",
    "events": [
      {
        "id": "e1",
        "type": "hypothesis",
        "step": 1,
        "content": "To book the flight, I need to click the 'Select' button on the cheapest flight row.",
        "confidence": 0.85,
        "links": []
      },
      {
        "id": "e2",
        "type": "action",
        "step": 2,
        "content": "Find button with text 'Select' and click it.",
        "tool": "click_element",
        "links": ["e1"]
      },
      {
        "id": "e3",
        "type": "observation",
        "step": 3,
        "content": "The page did not change, and the UI seems disabled. A gray overlay is visible.",
        "links": ["e2"]
      },
      {
        "id": "e4",
        "type": "action",
        "step": 4,
        "content": "Re-click the 'Select' button on the cheapest flight row.",
        "tool": "click_element",
        "links": ["e3"]
      },
      {
        "id": "e5",
        "type": "observation",
        "step": 5,
        "content": "No change. The same gray overlay remains.",
        "links": ["e4"]
      },
      {
        "id": "e6",
        "type": "failure",
        "step": 6,
        "content": "Looping action: Agent is clicking the selector button repeatedly, ignoring that a modal is locking page interaction.",
        "links": ["e3", "e5"]
      },
      {
        "id": "e7",
        "type": "action",
        "step": 7,
        "content": "Examine DOM elements to check for open modals or consent overlays.",
        "tool": "get_dom_tree",
        "links": ["e6"]
      },
      {
        "id": "e8",
        "type": "observation",
        "step": 8,
        "content": "A cookie consent banner `div#cookie-banner-overlay` has `z-index: 9999` and is obscuring the entire viewport.",
        "links": ["e7"]
      },
      {
        "id": "e9",
        "type": "belief_update",
        "step": 9,
        "content": "I cannot click the select button because the cookie banner blocks interaction. I must accept the cookies first.",
        "confidence": 0.95,
        "links": ["e8"]
      },
      {
        "id": "e10",
        "type": "action",
        "step": 10,
        "content": "Click 'Accept All Cookies' on the banner.",
        "tool": "click_element",
        "links": ["e9"]
      },
      {
        "id": "e11",
        "type": "observation",
        "step": 11,
        "content": "Overlay disappears. The main grid buttons are now active.",
        "links": ["e10"]
      },
      {
        "id": "e12",
        "type": "action",
        "step": 12,
        "content": "Click the 'Select' button on the cheapest flight row.",
        "tool": "click_element",
        "links": ["e11"]
      },
      {
        "id": "e13",
        "type": "observation",
        "step": 13,
        "content": "Navigated to traveler details page.",
        "links": ["e12"]
      },
      {
        "id": "e14",
        "type": "final_answer",
        "step": 14,
        "content": "Successfully proceeded to checkout page after closing the blocking cookie overlay.",
        "links": ["e13"]
      }
    ]
  },
  "database-migration": {
    "title": "Planning Agent: Database Migration Recovery",
    "events": [
      {
        "id": "e1",
        "type": "hypothesis",
        "step": 1,
        "content": "The database migration script failed because the database table `users` already exists in the dev db.",
        "confidence": 0.75,
        "links": []
      },
      {
        "id": "e2",
        "type": "action",
        "step": 2,
        "content": "Run `npm run db:migrate` again to check if it was a transient database error.",
        "tool": "run_terminal",
        "links": ["e1"]
      },
      {
        "id": "e3",
        "type": "observation",
        "step": 3,
        "content": "Output: Error: Table 'users' already exists.",
        "links": ["e2"]
      },
      {
        "id": "e4",
        "type": "failure",
        "step": 4,
        "content": "Redundant Command execution: Agent ran the exact same migration command without altering database state or configs, repeating the crash.",
        "links": ["e2", "e3"]
      },
      {
        "id": "e5",
        "type": "hypothesis",
        "step": 5,
        "content": "I should mark the migration as already applied or delete the existing table to allow a clean run.",
        "confidence": 0.80,
        "links": ["e4"]
      },
      {
        "id": "e6",
        "type": "decision",
        "step": 6,
        "content": "Choose to delete the table because it's a dev environment and data is seed-generated anyway.",
        "links": ["e5"]
      },
      {
        "id": "e7",
        "type": "action",
        "step": 7,
        "content": "Run SQL command `DROP TABLE users;`.",
        "tool": "run_sql",
        "links": ["e6"]
      },
      {
        "id": "e8",
        "type": "observation",
        "step": 8,
        "content": "Command succeeded. Table users dropped.",
        "links": ["e7"]
      },
      {
        "id": "e9",
        "type": "action",
        "step": 9,
        "content": "Run `npm run db:migrate` to create database schema.",
        "tool": "run_terminal",
        "links": ["e8"]
      },
      {
        "id": "e10",
        "type": "observation",
        "step": 10,
        "content": "Migration completed successfully. 4 tables created: users, posts, comments, sessions.",
        "links": ["e9"]
      },
      {
        "id": "e11",
        "type": "belief_update",
        "step": 11,
        "content": "Database schema is now fully aligned with migrations. The database state is verified.",
        "confidence": 1.0,
        "links": ["e9", "e10"]
      },
      {
        "id": "e12",
        "type": "final_answer",
        "step": 12,
        "content": "Database migration succeeded after dropping the conflicting users table.",
        "links": ["e11"]
      }
    ]
  }
};
