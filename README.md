# Obsidian Automaton & Logic Designer (In-Graph)

An interactive, high-performance visual editor for **Finite State Machines (FSM)** and **Logic Circuits** built directly into Obsidian. Create, simulate, and document computation models using a simple, human-readable DSL (Domain Specific Language) that renders into a highly interactive SVG canvas.

---

## 🚀 Key Features

### 🧠 Finite Automata (DFA/NFA/PDA)
- **MathJax Auto-Sizing:** Type complex LaTeX (e.g., `$\{q_0, q_1, q_2\}$`) and watch the state nodes mathematically calculate the exact physical bounding box of the rendered equation to perfectly resize themselves.
- **Interactive Graphing:** Smooth drag-and-drop interface for states and transitions.
- **Automata Essentials:** Toggle **Start States** (incoming arrow) and **Accept States** (double-circle) with a simple right-click.
- **Smart Pathing:** Support for straight lines, automatic 2-way curves, and manual Bezier waypoints for complex layouts.
- **DOT Import:** Instant migration from **Graphviz/DOT** files via a dedicated import modal.

### 🔌 Logic Circuit Designer & Simulator
- **Live Simulation:** Build circuits and click `INPUT` nodes to toggle their states. Watch the signals propagate through the wires with animated, glowing electricity.
- **Gate Library:** Integrated support for standard IEEE schematic gates: `AND`, `OR`, `NOT`, `XOR`, `NAND`, `NOR`, `XNOR`.
- **Truth Table Generator:** Right-click any circuit to instantly generate and copy a complete Truth Table based on your inputs and outputs.
- **Orthogonal (Manhattan) Routing:** Toggle "Straight Wires" in the settings to automatically route wires using clean, 90-degree stair-step angles.

### 🛠️ Pro Editor Tools
- **Real-Time Snippet Expander:** A built-in, regex-powered text expander (inspired by Latex Suite) that automatically converts triggers like `//` into `\frac{}{}`, auto-closes brackets, and handles complex MathJax on the fly.
- **Figma-Style Frames:** Group elements into beautiful, interactive frames. Dragging a frame automatically "scoops up" and moves all nodes, gates, and waypoints inside it (hold `Shift` while dragging to move just the frame).
- **Alignment & Distribution:** A full toolbar to align nodes (Left, Center, Right, Top, Bottom) and evenly distribute them across the canvas.
- **Batch Saving & Obsidian Native:** Optimized "Capture-Phase" saving to prevent file-write conflicts. Fully responsive to Obsidian's Dark/Light modes and custom theme accents.

---

## 🛠️ Usage

Wrap your graph data in an `in-graph` code block. You can open the DSL editor by clicking the background of the graph or pressing `Ctrl + Shift + G`.

### Example: Automaton
```text
start: q0
accept: q2
q0 [label="$\{q_0\}$"]
q1 [label="$\{q_0,q_1\}$"]
q2 [label="$\{q_2\}$"]

q0 -> q1 : a
q0 -> q2 : b
q1 -> q2 : a, b
q2 -> q2 : a, b [via 200,150b; 250,150b]
```

### Example: Logic Circuit
```text
group Inputs:
  A = INPUT [label="Switch A"]
  B = INPUT [active=true]

C = AND(A, B)
D = NOT(C)
OUT = OUTPUT(D)
```

---

## ⌨️ Interaction Guide

| Action | Method |
| :--- | :--- |
| **Toggle DSL Editor** | `Ctrl + Shift + G` |
| **Apply DSL Code** | `Ctrl + Shift + Enter` |
| **Save Graph** | `Ctrl + S` |
| **Add State/Gate** | Right-click Canvas → `Add state here` / `Add gate` |
| **Link Nodes** | Hover over node → Click the `+` button → Click target node |
| **Edit Label** | Double-click any Node or Edge |
| **Bend Wires** | Hover edge → Drag orange/blue waypoint dots |
| **Frame Selection** | Drag a frame to move contents. Hold `Shift` to move just the frame. |
| **Zoom / Pan** | Mouse Wheel / Alt + Drag (or Middle-click) |

---

## 🎨 Theming & Customization

Go to **Settings → Automaton & Logic Designer** to heavily customize your experience:
- **Theme Presets:** Choose from built-in themes or customize individual token colors (Canvas, Nodes, Edges, Active Wires, Frames).
- **Custom Snippets:** Load your own `snippets.js` file from your vault to define custom regex text-expansion rules for the DSL editor.
- **Routing & Behaviors:** Toggle orthogonal wire routing, default undo history limits, and default canvas heights.

---

## 📂 Installation

*Note: This plugin is currently in manual installation phase.*

1. Navigate to your vault's plugin folder: `.obsidian/plugins/`.
2. Create a folder named `obsidian-in-graph`.
3. Drop `main.js`, `manifest.json`, and `styles.css` into the folder.
4. Restart Obsidian and enable the plugin in **Community Plugins**.

---

## 🎓 Academic Use

This plugin was engineered specifically to assist Computer Science students in creating clean, professional, and mathematically accurate diagrams for Theory of Computation, Automata, and Digital Systems courses. Because the graphs exist natively inside Obsidian, they are perfect for open-book exams, homework submissions, and heavily mathematical study vaults.