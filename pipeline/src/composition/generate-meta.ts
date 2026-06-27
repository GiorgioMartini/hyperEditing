export function generateHyperframesJson(): string {
  return JSON.stringify(
    {
      $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json',
      registry: 'https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry',
      paths: {
        blocks: 'compositions',
        components: 'compositions/components',
        assets: 'assets',
      },
    },
    null,
    2,
  );
}

export function generateMetaJson(
  projectName: string,
  width: number,
  height: number,
  fps = 30,
): string {
  return JSON.stringify(
    {
      id: projectName,
      name: projectName,
      width,
      height,
      fps,
    },
    null,
    2,
  );
}
