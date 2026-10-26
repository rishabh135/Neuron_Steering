# Workflows and intervention diagrams

## Experiment workflow

```mermaid
flowchart TD
    A["Pin source, model and tokenizer"] --> B["Measure unsteered residual medians"]
    B --> C{"Choose backend"}
    C --> D["Hugging Face neuron hook"]
    C --> E["Export residual vectors"]
    E --> F["llama.cpp: BF16, Q8 or Q4"]
    D --> G["Same prompt: baseline, recipe, reverse"]
    F --> G
    G --> H["Save outputs and provenance"]
    H --> I{"Pass sham and coherence checks?"}
    I -->|Yes| J["Blind scoring on held-out prompts"]
    I -->|No| K["Inspect dose, template and runtime"]
    K --> B
```

## Exact location of the additive intervention

```mermaid
flowchart TD
    A["Residual after attention"] --> B["RMS norm"]
    A --> R["Residual skip path"]
    B --> C["SiLU gate times up projection"]
    D["Dose times R divided by column norm"] --> E["Add to activation z at neuron n"]
    C --> E
    E --> F["Down projection"]
    F --> G["Residual addition"]
    R --> G
    G --> H["Next decoder layer"]
```

## Why autoregressive replies diverge

```mermaid
flowchart TD
    P["Identical prompt prefix"] --> A["Original internal state"]
    P --> B["Intervened internal state"]
    A --> C["Baseline token distribution"]
    B --> D["Changed token distribution"]
    C --> E["Choose baseline token"]
    D --> F["Choose recipe token"]
    E --> G["Baseline history for next step"]
    F --> H["Recipe history for next step"]
    G --> A
    H --> B
```

The loops after the first token no longer share identical histories. Use teacher-forced common prefixes when isolating local distribution changes. Arrow width and animation speed are explanatory; they do not encode measured signal magnitude or latency.
