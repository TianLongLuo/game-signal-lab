export const SCENE_PRESETS = Object.freeze(
  [
    {
      id: "cafe",
      zh: "雨日下午的咖啡馆",
      en: "An afternoon café",
      url: "/companion/scenes/cafe.jpg",
    },
    {
      id: "rain",
      zh: "雨后的城市街角",
      en: "After the rain",
      url: "/companion/scenes/rain.jpg",
    },
    {
      id: "home",
      zh: "留着一盏灯的客厅",
      en: "A light left on",
      url: "/companion/scenes/home.jpg",
    },
    {
      id: "coast",
      zh: "落日海岸",
      en: "The coast at sunset",
      url: "/companion/scenes/coast.jpg",
    },
    {
      id: "garden",
      zh: "午后的花园",
      en: "A garden afternoon",
      url: "/companion/scenes/garden.jpg",
    },
  ].map(Object.freeze),
);

export function getScenePreset(id) {
  return SCENE_PRESETS.find((scene) => scene.id === id) ?? SCENE_PRESETS[0];
}
