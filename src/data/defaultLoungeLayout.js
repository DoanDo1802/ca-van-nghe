// Default lounge furniture and decor layout
// Designed with beautiful symmetry, left grand bar, and central ceremonial aisle to stage

export const DEFAULT_LOUNGE_DECO_ITEMS = [
  // ====================================================
  // 1. GRAND LUXURY BAR ON THE LEFT (X: -10.0m, Z: -4.0m to +4.0m)
  // ====================================================
  // 8 Quầy Bar liền mạch không kẽ hở (Mỗi module rộng chuẩn 1.00m)
  {
    id: 'def_bar_0',
    name: 'Quầy Bar Module 1',
    category: 'counter',
    url: '/models/Restaurant_Bar.glb',
    position: [-10.0, 0, -3.5],
    rotation: [0, Math.PI / 2, 0],
    scale: [1, 1, 1],
    interactiveId: 'bar'
  },
  {
    id: 'def_bar_1',
    name: 'Quầy Bar Module 2',
    category: 'counter',
    url: '/models/Restaurant_Bar.glb',
    position: [-10.0, 0, -2.5],
    rotation: [0, Math.PI / 2, 0],
    scale: [1, 1, 1],
    interactiveId: 'bar'
  },
  {
    id: 'def_bar_2',
    name: 'Quầy Bar Module 3',
    category: 'counter',
    url: '/models/Restaurant_Bar.glb',
    position: [-10.0, 0, -1.5],
    rotation: [0, Math.PI / 2, 0],
    scale: [1, 1, 1],
    interactiveId: 'bar'
  },
  {
    id: 'def_bar_3',
    name: 'Quầy Bar Module 4',
    category: 'counter',
    url: '/models/Restaurant_Bar.glb',
    position: [-10.0, 0, -0.5],
    rotation: [0, Math.PI / 2, 0],
    scale: [1, 1, 1],
    interactiveId: 'bar'
  },
  {
    id: 'def_bar_4',
    name: 'Quầy Bar Module 5',
    category: 'counter',
    url: '/models/Restaurant_Bar.glb',
    position: [-10.0, 0, 0.5],
    rotation: [0, Math.PI / 2, 0],
    scale: [1, 1, 1],
    interactiveId: 'bar'
  },
  {
    id: 'def_bar_5',
    name: 'Quầy Bar Module 6',
    category: 'counter',
    url: '/models/Restaurant_Bar.glb',
    position: [-10.0, 0, 1.5],
    rotation: [0, Math.PI / 2, 0],
    scale: [1, 1, 1],
    interactiveId: 'bar'
  },
  {
    id: 'def_bar_6',
    name: 'Quầy Bar Module 7',
    category: 'counter',
    url: '/models/Restaurant_Bar.glb',
    position: [-10.0, 0, 2.5],
    rotation: [0, Math.PI / 2, 0],
    scale: [1, 1, 1],
    interactiveId: 'bar'
  },
  {
    id: 'def_bar_7',
    name: 'Quầy Bar Module 8',
    category: 'counter',
    url: '/models/Restaurant_Bar.glb',
    position: [-10.0, 0, 3.5],
    rotation: [0, Math.PI / 2, 0],
    scale: [1, 1, 1],
    interactiveId: 'bar'
  },

  // 8 Ghế Bar xếp THẲNG TẮP trên toạ độ X = -8.50, đối diện Bartender
  {
    id: 'bar_stool_1',
    name: 'Ghế Quầy Bar 1',
    category: 'furniture',
    url: '/models/Bar_Chair.glb',
    position: [-8.5, 0, -3.5],
    rotation: [0, -Math.PI / 2, 0],
    scale: [1, 1, 1],
    isChair: true,
    seatHeight: 0.83
  },
  {
    id: 'bar_stool_2',
    name: 'Ghế Quầy Bar 2',
    category: 'furniture',
    url: '/models/Bar_Chair.glb',
    position: [-8.5, 0, -2.5],
    rotation: [0, -Math.PI / 2, 0],
    scale: [1, 1, 1],
    isChair: true,
    seatHeight: 0.83
  },
  {
    id: 'bar_stool_3',
    name: 'Ghế Quầy Bar 3',
    category: 'furniture',
    url: '/models/Bar_Chair.glb',
    position: [-8.5, 0, -1.5],
    rotation: [0, -Math.PI / 2, 0],
    scale: [1, 1, 1],
    isChair: true,
    seatHeight: 0.83
  },
  {
    id: 'bar_stool_4',
    name: 'Ghế Quầy Bar 4',
    category: 'furniture',
    url: '/models/Bar_Chair.glb',
    position: [-8.5, 0, -0.5],
    rotation: [0, -Math.PI / 2, 0],
    scale: [1, 1, 1],
    isChair: true,
    seatHeight: 0.83
  },
  {
    id: 'bar_stool_5',
    name: 'Ghế Quầy Bar 5',
    category: 'furniture',
    url: '/models/Bar_Chair.glb',
    position: [-8.5, 0, 0.5],
    rotation: [0, -Math.PI / 2, 0],
    scale: [1, 1, 1],
    isChair: true,
    seatHeight: 0.83
  },
  {
    id: 'bar_stool_6',
    name: 'Ghế Quầy Bar 6',
    category: 'furniture',
    url: '/models/Bar_Chair.glb',
    position: [-8.5, 0, 1.5],
    rotation: [0, -Math.PI / 2, 0],
    scale: [1, 1, 1],
    isChair: true,
    seatHeight: 0.83
  },
  {
    id: 'bar_stool_7',
    name: 'Ghế Quầy Bar 7',
    category: 'furniture',
    url: '/models/Bar_Chair.glb',
    position: [-8.5, 0, 2.5],
    rotation: [0, -Math.PI / 2, 0],
    scale: [1, 1, 1],
    isChair: true,
    seatHeight: 0.83
  },
  {
    id: 'bar_stool_8',
    name: 'Ghế Quầy Bar 8',
    category: 'furniture',
    url: '/models/Bar_Chair.glb',
    position: [-8.5, 0, 3.5],
    rotation: [0, -Math.PI / 2, 0],
    scale: [1, 1, 1],
    isChair: true,
    seatHeight: 0.83
  },

  // Đồ uống & Dụng cụ pha chế ĐẶT CHUẨN XÁC TRÊN MẶT QUẦY BAR (Y = 1.18, X = -9.55)
  {
    id: 'def_bar_props_1',
    name: 'Bộ Ly & Rượu Cocktail Bắc',
    category: 'props',
    url: '/models/Bar_props.glb',
    position: [-9.55, 1.18, -2.0],
    rotation: [0, Math.PI / 2, 0],
    scale: [0.65, 0.65, 0.65],
    interactiveId: 'bar'
  },
  {
    id: 'def_bar_props_2',
    name: 'Bộ Pha Chế & Champagne Trung Tâm',
    category: 'props',
    url: '/models/Bar_props.glb',
    position: [-9.55, 1.18, 0.0],
    rotation: [0, Math.PI / 2, 0],
    scale: [0.65, 0.65, 0.65],
    interactiveId: 'bar'
  },
  {
    id: 'def_bar_props_3',
    name: 'Bộ Ly & Rượu Cocktail Nam',
    category: 'props',
    url: '/models/Bar_props.glb',
    position: [-9.55, 1.18, 2.0],
    rotation: [0, Math.PI / 2, 0],
    scale: [0.65, 0.65, 0.65],
    interactiveId: 'bar'
  },

  // Kệ Rượu Sau Quầy Bar (Back Bar Shelving)
  {
    id: 'def_bar_shelf_1',
    name: 'Kệ Rượu Quầy Bar Bắc',
    category: 'counter',
    url: '/models/Restaurant_BarShelf.glb',
    position: [-13.5, 0, -1.8],
    rotation: [0, Math.PI / 2, 0],
    scale: [1, 1, 1],
    interactiveId: 'winestand'
  },
  {
    id: 'def_bar_shelf_2',
    name: 'Kệ Rượu Quầy Bar Nam',
    category: 'counter',
    url: '/models/Restaurant_BarShelf.glb',
    position: [-13.5, 0, 1.8],
    rotation: [0, Math.PI / 2, 0],
    scale: [1, 1, 1],
    interactiveId: 'winestand'
  },

  // 2 Tủ Rượu Vang Độc Lập Hai Đầu Quầy Bar
  {
    id: 'def_winestand_1',
    name: 'Tủ Rượu Vang Cánh Bắc',
    category: 'counter',
    url: '/models/Winestand.glb',
    position: [-13.5, 0, -4.8],
    rotation: [0, Math.PI / 2, 0],
    scale: [1, 1, 1],
    interactiveId: 'winestand'
  },
  {
    id: 'def_winestand_2',
    name: 'Tủ Rượu Vang Cánh Nam',
    category: 'counter',
    url: '/models/Winestand.glb',
    position: [-13.5, 0, 4.8],
    rotation: [0, Math.PI / 2, 0],
    scale: [1, 1, 1],
    interactiveId: 'winestand'
  },

  // Đèn Cây Chiếu Sáng Quầy Bar
  {
    id: 'def_lamp_bar_1',
    name: 'Đèn Cây Quầy Bar Bắc',
    category: 'decor',
    url: '/models/Floor_Lamp.glb',
    position: [-7.2, 0, -5.2],
    rotation: [0, 0, 0],
    scale: [1.6, 1.6, 1.6]
  },
  {
    id: 'def_lamp_bar_2',
    name: 'Đèn Cây Quầy Bar Nam',
    category: 'decor',
    url: '/models/Floor_Lamp.glb',
    position: [-7.2, 0, 5.2],
    rotation: [0, 0, 0],
    scale: [1.6, 1.6, 1.6]
  },

  // ====================================================
  // 2. GRAND LIVE ACOUSTIC STAGE (Z: -9m to -14m)
  // (Đã loại bỏ hoàn toàn các bảng trắng Boards.glb)
  // ====================================================
  // Vách Ngăn Trang Trí Sân Khấu Đối Xứng Trái & Phải
  {
    id: 'def_divider_1',
    name: 'Vách Ngăn Sân Khấu Trái',
    category: 'decor',
    url: '/models/Restaurant_Divider.glb',
    position: [-6.8, 0.36, -11.8],
    rotation: [0, 0.28, 0],
    scale: [1, 1, 1]
  },
  {
    id: 'def_divider_2',
    name: 'Vách Ngăn Sân Khấu Phải',
    category: 'decor',
    url: '/models/Restaurant_Divider.glb',
    position: [6.8, 0.36, -11.8],
    rotation: [0, -0.28, 0],
    scale: [1, 1, 1]
  },

  // Đèn Cây Chiếu Sáng Chân Sân Khấu
  {
    id: 'def_stage_lamp_1',
    name: 'Đèn Sân Khấu Trái',
    category: 'decor',
    url: '/models/Floor_Lamp.glb',
    position: [-6.2, 0, -8.8],
    rotation: [0, 0, 0],
    scale: [1.6, 1.6, 1.6]
  },

  // ====================================================
  // 3. SẢNH ĐÓN TIẾP & QUẦY LỄ TÂN (Z: +11.2)
  // ====================================================
  {
    id: 'def_reception',
    name: 'Quầy Lễ Tân & Đón Tiếp',
    category: 'counter',
    url: '/models/Restaurant_Reception_Desk.glb',
    position: [0, 0, 11.2],
    rotation: [0, Math.PI, 0],
    scale: [1, 1, 1],
    interactiveId: 'table'
  },

  // Tượng Nghệ Thuật Sảnh Đón
  {
    id: 'def_statue_2',
    name: 'Tượng Điêu Khắc Sảnh Đón',
    category: 'decor',
    url: '/models/statue.glb',
    position: [-13.5, 0, 9.5],
    rotation: [0, Math.PI / 4, 0],
    scale: [1.2, 1.2, 1.2],
    interactiveId: 'statue'
  }
];
