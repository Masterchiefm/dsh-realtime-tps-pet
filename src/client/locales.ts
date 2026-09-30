/** `speedPet` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'speedPet'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'pet.aria': '输出速度桌宠',
  'pet.live.title': '实时输出速度：近 15 秒滑动窗口估算，每次调用完成后按真实 token 数自校准',
  'pet.waiting.title': '已连接，等待首个输出',
  'speed.value': '{tps} tok/s',
  'speed.waiting': '…',
  'speed.last': '上步均速 {tps} t/s',
  'speed.last.empty': '上步均速 --',
  'speed.last.title': '上步均速：最近一次已完成步骤的输出速度（输出 token ÷ 纯生成时长）。区别于应用内置的按轮统计',
  'menu.form.pet': '桌宠形态',
  'menu.form.gauge': '环形仪表形态',
  'menu.form.capsule': '速度胶囊形态',
  'menu.pack': '换一只宠物：{name}',
  'menu.alwaysLast': '常显上步均速',
  'menu.hideIdle': '空闲时隐藏',
} as const

/** Dictionary key union derived from the Chinese source of truth. */
export type SpeedPetKey = keyof typeof zh

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<SpeedPetKey, string> = {
  'pet.aria': 'Output speed pet',
  'pet.live.title': 'Live output speed: rolling 15-second window estimate, self-calibrated against exact tokens after each call',
  'pet.waiting.title': 'Connected, waiting for the first token',
  'speed.value': '{tps} tok/s',
  'speed.waiting': '…',
  'speed.last': 'last step {tps} t/s',
  'speed.last.empty': 'last step --',
  'speed.last.title': 'Last-step average: output speed of the latest completed step (output tokens ÷ pure decode time); distinct from the built-in per-turn statistic',
  'menu.form.pet': 'Pet form',
  'menu.form.gauge': 'Ring gauge form',
  'menu.form.capsule': 'Speed capsule form',
  'menu.pack': 'Cycle pet: {name}',
  'menu.alwaysLast': 'Always show the last-step average',
  'menu.hideIdle': 'Hide while idle',
}
