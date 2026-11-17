// Dependencies point inward only: shared <- engine <- render <- export <- features <- ui.
const LAYERS = ['shared', 'engine', 'render', 'export', 'features', 'ui'];

const patternsFor = (forbidden) => ({
  group: forbidden.flatMap((layer) => [
    `@/${layer}`,
    `@/${layer}/**`,
    `**/${layer}`,
    `**/${layer}/**`,
  ]),
  message:
    'Layers may only import from layers to their left: shared, engine, render, export, features, ui.',
});

export const layerRules = LAYERS.slice(0, -1).map((layer, index) => ({
  files: [`src/${layer}/**/*.{ts,svelte}`],
  rules: {
    'no-restricted-imports': ['error', { patterns: [patternsFor(LAYERS.slice(index + 1))] }],
  },
}));
