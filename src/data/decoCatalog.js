export const DECO_CATEGORIES = [
  { id: 'furniture', label: 'Bàn Ghế', icon: '🪑' },
  { id: 'counter',   label: 'Quầy & Kệ', icon: '🍳' },
  { id: 'food',      label: 'Món Ăn', icon: '🥩' },
  { id: 'decor',     label: 'Decor & Đèn', icon: '🪴' }
];

export const DECO_CATALOG = [
  // --- Bàn Ghế ---
  {
    id: 'table_rect',
    name: 'Bàn Tiệc Chữ Nhật',
    category: 'furniture',
    url: '/models/Restaurant_Table_Rectangular.glb',
    defaultScale: [1.15, 1.0, 1.15],
    defaultY: 0,
    icon: '🪑'
  },
  {
    id: 'table_round',
    name: 'Bàn Tròn Cafe',
    category: 'furniture',
    url: '/models/Summer_Terrace_Table.glb',
    defaultScale: [1.1, 1.0, 1.1],
    defaultY: 0,
    icon: '☕'
  },
  {
    id: 'chair_dining',
    name: 'Ghế Tiệc Bọc Nệm',
    category: 'furniture',
    url: '/models/Restaurant_chair.glb',
    defaultScale: [1.0, 1.0, 1.0],
    defaultY: 0,
    icon: '💺'
  },
  {
    id: 'chair_bar',
    name: 'Ghế Quầy Bar',
    category: 'furniture',
    url: '/models/Bar_Chair.glb',
    defaultScale: [1.0, 1.0, 1.0],
    defaultY: 0,
    icon: '🍸'
  },
  {
    id: 'bar_module',
    name: 'Quầy Bar Sang Trọng',
    category: 'furniture',
    url: '/models/Restaurant_Bar.glb',
    defaultScale: [1.0, 1.0, 1.0],
    defaultY: 0,
    icon: '🍷'
  },

  // --- Quầy & Kệ ---
  {
    id: 'bar_shelf',
    name: 'Kệ Rượu Âm Tường',
    category: 'counter',
    url: '/models/Restaurant_BarShelf.glb',
    defaultScale: [1.0, 1.0, 1.0],
    defaultY: 0,
    icon: '🍾'
  },
  {
    id: 'winestand',
    name: 'Tủ Trưng Bày Rượu Vang',
    category: 'counter',
    url: '/models/Winestand.glb',
    defaultScale: [1.0, 1.0, 1.0],
    defaultY: 0,
    icon: '🍷'
  },
  {
    id: 'reception',
    name: 'Bàn Lễ Tân Đón Khách',
    category: 'counter',
    url: '/models/Restaurant_Reception_Desk.glb',
    defaultScale: [1.0, 1.0, 1.0],
    defaultY: 0,
    icon: '🛎️'
  },
  {
    id: 'divider',
    name: 'Vách Ngăn Gỗ Nghệ Thuật',
    category: 'counter',
    url: '/models/Restaurant_Divider.glb',
    defaultScale: [1.0, 1.0, 1.0],
    defaultY: 0,
    icon: '🪵'
  },
  {
    id: 'stage_boards',
    name: 'Bục Sân Khấu Gỗ',
    category: 'counter',
    url: '/models/Boards.glb',
    defaultScale: [1.0, 1.0, 1.0],
    defaultY: 0.36,
    icon: '🎭'
  },

  // --- Món Ăn ---
  {
    id: 'steak',
    name: 'Bít Tết Bò Ribeye',
    category: 'food',
    url: '/models/Steak.glb',
    defaultScale: [1.9, 1.9, 1.9],
    defaultY: 0.75,
    icon: '🥩'
  },
  {
    id: 'pizza',
    name: 'Pizza Nướng Củi',
    category: 'food',
    url: '/models/Pizza.glb',
    defaultScale: [0.95, 0.95, 0.95],
    defaultY: 0.75,
    icon: '🍕'
  },
  {
    id: 'burger',
    name: 'Burger Bò Wagyu',
    category: 'food',
    url: '/models/Burger.glb',
    defaultScale: [1.5, 1.5, 1.5],
    defaultY: 0.75,
    icon: '🍔'
  },
  {
    id: 'bar_props',
    name: 'Bộ Ly & Chai Rượu Cocktail',
    category: 'food',
    url: '/models/Bar_props.glb',
    defaultScale: [0.7, 0.7, 0.7],
    defaultY: 1.18,
    icon: '🍹'
  },

  // --- Decor & Đèn ---
  {
    id: 'statue',
    name: 'Tượng Nghệ Thuật 3D',
    category: 'decor',
    url: '/models/statue.glb',
    defaultScale: [0.9, 0.9, 0.9],
    defaultY: 0,
    icon: '🗽'
  },
  {
    id: 'floor_lamp',
    name: 'Đèn Sàn Đứng Lounge',
    category: 'decor',
    url: '/models/Floor_Lamp.glb',
    defaultScale: [1.0, 1.0, 1.0],
    defaultY: 0,
    icon: '💡'
  },
  {
    id: 'gig_stage_set',
    name: 'Dàn Nhạc Sân Khấu Gig Live (Trống, Loa, Mic)',
    category: 'decor',
    url: '/models/every_other_gig_ever.glb',
    defaultScale: [0.15, 0.15, 0.15],
    defaultY: 0.36,
    icon: '🥁'
  },
  {
    id: 'mic_stand',
    name: 'Chân Micro Sân Khấu (1.28m)',
    category: 'decor',
    url: '/models/MicStand.glb',
    defaultScale: [1, 1, 1],
    defaultY: 0.36,
    icon: '🎙️'
  },
  {
    id: 'microphone',
    name: 'Micro Cầm Tay (0.22m)',
    category: 'props',
    url: '/models/Microphone.glb',
    defaultScale: [1, 1, 1],
    defaultY: 1.0,
    icon: '🎤'
  }
];

