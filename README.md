# In-Note Graph

A powerful Obsidian plugin for creating and editing visual graphs and automatons directly within your notes.

## Overview

In-Note Graph is a visual editor plugin for [Obsidian](https://obsidian.md/) that enables you to design and visualize:

- **Graphs**: Create directed graphs with nodes and edges
- **Automatons**: Design state machines and finite automatons
- **Circuits**: Build and simulate digital logic circuits
- **Custom Themes**: Apply custom styling to your visualizations
- **Real-time Editing**: Edit your diagrams directly in your notes with instant preview

## Features

### 📊 Graph Editor
- Create nodes and edges with a visual interface
- Support for node labels and customizable positioning
- Automatic rendering within markdown code blocks

### 🤖 Automaton Support
- Design finite state automatons
- Configure states and transitions
- Visual representation of state machines

### ⚡ Circuit Simulation
- Create digital logic circuits with gates and wires
- Support for various circuit components
- Integrated circuit simulator

### 🎨 Theming System
- Customize appearance of your diagrams
- Pre-configured theme presets
- Individual theme customization per diagram

### 📐 Advanced Features
- Viewport management and zoom controls
- Group nodes for organizing complex diagrams
- Embedded SVG rendering
- MathJax support for mathematical notation
- Multi-note management with automatic saving

## Installation

1. Open Obsidian Settings → Community plugins → Browse
2. Search for "In-Note Graph"
3. Click Install
4. Enable the plugin

## Usage

### Creating a Graph

Use the `in-graph` code block in your markdown:

````markdown
```in-graph
{
  "nodes": [
    { "id": "q0", "position": { "x": 150, "y": 250 }, "label": "q0" },
    { "id": "q1", "position": { "x": 350, "y": 250 }, "label": "q1" }
  ],
  "edges": [
    { "from": "q0", "to": "q1", "label": "a" }
  ],
  "theme": "default",
  "viewport": { "x": 0, "y": 0, "zoom": 1 }
}
```
````

### Graph JSON Structure

```json
{
  "nodes": [
    {
      "id": "unique_id",
      "position": { "x": 100, "y": 100 },
      "label": "Node Label",
      "isStart": true,
      "isAccepting": false
    }
  ],
  "edges": [
    {
      "id": "unique_id",
      "source": "source_node_id",
      "target": "target_node_id",
      "type": "arrow/none",
      "label": "Edge Label",
      "isBendable": false,
      "waypoints": [
        {
            "id": "unique_id",
            "x": 100,
            "y": 100,
            "type": "bezier/linear"
        }
      ]
    }
  ],
  "gates": [
    {
      "id": "unique_id",
      "type": "INPUT/OUTPUT/AND/OR/NOT/NAND/NOR/XOR/XNOR",
      "position": { "x": 100, "y": 100 },
      "label": "Gate Label"
    }
  ],
  "wires": [
    {
      "id": "unique_id",
      "fromGate": "source_gate_id",
      "fromPort": "out_port_name",
      "toGate": "target_gate_id",
      "toPort": "in_port_name",
      "isBendable": false,
      "waypoints": [
        {
            "id": "unique_id",
            "x": 100,
            "y": 100,
            "type": "bezier/linear"
        }
      ]
    }
  ],
  "groups": [
    {
      "id": "unique_id",
      "label": "Group Label",
      "x": 100,
      "y": 100,
      "w": 100,
      "h": 100
    }
  ],
  "theme": {},
  "viewport": { "x": 0, "y": 0, "zoom": 1 }
}
```

## Settings

Access plugin settings via Obsidian Settings → In-Note Graph:

- Theme preferences
- Editor options
- Default viewport settings
- Diagram styling options

## Technical Details

- **Built with**: TypeScript, React, SVG
- **Minimum Obsidian version**: 0.10.8
- **Desktop only**: This plugin is currently available for desktop versions only

### Project Structure

```
src/
├── index.ts                 # Main plugin entry point
├── models/
│   ├── automaton.ts        # Automaton model definitions
│   ├── circuits.ts         # Circuit component models
│   ├── graph.ts            # Graph data structures
│   ├── settings.ts         # Plugin settings
│   └── theme.ts            # Theme configuration
├── services/
│   └── circuitSimulator.ts  # Circuit simulation logic
└── ui/
    ├── settings.ts         # Settings UI
    └── SvgEditor.ts        # Visual SVG editor
```

## Development

### Setup

```bash
npm install
```

### Build

```bash
# Development build
npm run dev

# Production build
npm run build

# Production build without linting
npm run build:nolint
```

### Linting

```bash
npm run lint
```

### Testing

```bash
# Run tests
npm run test

# Watch mode
npm run test:watch
```

## License

MIT License - See [LICENSE](LICENSE) file for details

## Author

ShakedKod

## Support

For issues, questions, or feature requests, please refer to the plugin repository.

## Version

Current version: 0.1.0
