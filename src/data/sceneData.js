export const CHAIRS_LIST = [
  // --- Bar Stools along the Grand Bar (Height 0.83m, facing west -X towards counter) ---
  { id: 'bar_stool_1', title: 'Ghế Quầy Bar 1', position: [-8.8, 0, -3.0], seatPosition: [-8.8, 0.83, -3.0], seatRotation: -Math.PI / 2 },
  { id: 'bar_stool_2', title: 'Ghế Quầy Bar 2', position: [-8.8, 0, -1.5], seatPosition: [-8.8, 0.83, -1.5], seatRotation: -Math.PI / 2 },
  { id: 'bar_stool_3', title: 'Ghế Quầy Bar 3', position: [-8.8, 0,  0.0], seatPosition: [-8.8, 0.83,  0.0], seatRotation: -Math.PI / 2 },
  { id: 'bar_stool_4', title: 'Ghế Quầy Bar 4', position: [-8.8, 0,  1.5], seatPosition: [-8.8, 0.83,  1.5], seatRotation: -Math.PI / 2 },
  { id: 'bar_stool_5', title: 'Ghế Quầy Bar 5', position: [-8.8, 0,  3.0], seatPosition: [-8.8, 0.83,  3.0], seatRotation: -Math.PI / 2 },
  { id: 'bar_stool_6', title: 'Ghế Quầy Bar 6', position: [-8.8, 0,  4.5], seatPosition: [-8.8, 0.83,  4.5], seatRotation: -Math.PI / 2 }
];

export const INTERACTABLES_LIST = [
  { id: 'bar', title: 'Quầy Bar Pha Chế & Cocktail', position: [-9.5, 1.2, 0.5] },
  { id: 'winestand', title: 'Kệ Rượu Vang Quốc Tế', position: [-14.0, 1.5, 2.0] },
  { id: 'stage_screen', title: 'Màn Hình LED Sân Khấu (YouTube)', position: [0, 2.0, -14.5] },
  { id: 'boards', title: 'Sân Khấu & Lịch Live Acoustic', position: [0, 1.5, -11.5] },
  { id: 'table', title: 'Quầy Lễ Tân & Đón Tiếp', position: [0, 1.2, 11.0] }
];

export const INTERACTIVE_OBJECTS = {
  'bar': {
    title: 'Quầy Bar Sang Trọng & Pha Chế',
    tag: 'Signature Bar',
    category: 'drinks',
    image: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=800&q=80',
    description: 'Không gian quầy bar bằng đá hoa cương và gỗ mộc cổ điển, nơi các bartender tài ba pha chế các ly cocktail độc quyền và phục vụ những dòng rượu vang hảo hạng.',
    highlights: [
      'Bộ sưu tập hơn 30 dòng rượu vang quốc tế',
      'Cocktail thủ công signature theo mùa',
      'Bartender biểu diễn pha chế trực tiếp mỗi tối'
    ],
    specials: [
      { name: 'Ca Văn Nghệ Sunset Cocktail', price: '145.000đ', desc: 'Rượu Gin infused trà sen, cam vàng, si-rô hoa cúc tự làm & tonic.' },
      { name: 'Smoked Bourbon Old Fashioned', price: '165.000đ', desc: 'Bourbon hảo hạng hun khói gỗ sồi, vỏ cam tươi và đường mía thô.' },
      { name: 'Cold Brew Đào Cam Sả', price: '68.000đ', desc: 'Cà phê ủ lạnh 18h thơm ngát vị đào mọng và hương sả thanh mát.' }
    ]
  },
  'table': {
    title: 'Quầy Lễ Tân & Đón Tiếp',
    tag: 'Welcome Lounge',
    category: 'space',
    image: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80',
    description: 'Nơi nhân viên Ca Văn Nghệ chào đón bạn đến với không gian nghệ thuật, hỗ trợ check-in bàn đã đặt hoặc hướng dẫn chọn vị trí ngồi lý tưởng.',
    highlights: [
      'Đội ngũ lễ tân thân thiện, chu đáo',
      'Hỗ trợ đặt bàn cho nhóm bạn hoặc sự kiện riêng tư',
      'Phục vụ nước chào mừng (Welcome Drink) thảo mộc'
    ],
    actionText: 'Đặt Bàn Ngay'
  },
  'burger': {
    title: 'Wagyu Truffle Burger Đặc Biệt',
    tag: 'Chef Special',
    category: 'food',
    price: '185.000đ',
    calories: '650 kcal',
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80',
    description: 'Thịt bò Wagyu xay mọng nước nướng lửa than, phô mai Cheddar già chảy tràn, sốt nấm Truffle đen thơm nức mũi kẹp cùng bánh brioche bơ Pháp nướng giòn.',
    ingredients: ['Thịt bò Wagyu Úc', 'Sốt nấm Truffle đen', 'Phô mai Cheddar già', 'Bánh mì Brioche thủ công', 'Khoai tây chiên muối biển'],
    actionText: 'Gọi Món Này'
  },
  'pizza': {
    title: 'Pizza Artisan Nướng Củi',
    tag: 'Best Seller',
    category: 'food',
    price: '195.000đ',
    calories: '820 kcal',
    image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80',
    description: 'Đế bánh bột men tươi ủ chậm 48 giờ nướng lò củi giòn phồng, phủ sốt cà chua San Marzano, phô mai Mozzarella tươi, xúc xích cay Ý và lá húng tây.',
    ingredients: ['Bột men chua ủ 48h', 'Cà chua San Marzano D.O.P', 'Mozzarella di Bufala', 'Xúc xích Ý cay Salame', 'Dầu ô-liu nguyên chất'],
    actionText: 'Gọi Món Này'
  },
  'steak': {
    title: 'Thăn Ngoại Bò Ribeye Bơ Thảo Mộc',
    tag: 'Signature Dish',
    category: 'food',
    price: '320.000đ',
    calories: '720 kcal',
    image: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80',
    description: 'Thăn bò Ribeye Black Angus mọng nước áp chảo chín vừa (Medium Rare), rưới bơ tỏi hương thảo đượm vị, kèm măng tây xào bơ và khoai tây nghiền mịn màng.',
    ingredients: ['Thăn bò Black Angus 250g', 'Bơ thảo mộc Rosemary & Tỏi', 'Khoai tây nghiền truffle', 'Măng tây tươi', 'Sốt tiêu đen Phú Quốc'],
    actionText: 'Gọi Món Này'
  },
  'winestand': {
    title: 'Hầm & Kệ Rượu Vang Ca Văn Nghệ',
    tag: 'Wine Cellar',
    category: 'drinks',
    image: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=800&q=80',
    description: 'Bảo quản ở nhiệt độ chuẩn 16°C, quy tụ những chai vang tuyển chọn từ Bordeaux, thung lũng Napa, và Chianti cổ điển.',
    highlights: [
      'Château Margaux Premier Cru',
      'Cabernet Sauvignon Napa Valley Reserve',
      'Pinot Noir Domaine Dujac',
      'Prosecco Superiore Ý khai vị'
    ],
    actionText: 'Xem Menu Vang'
  },
  'stage_screen': {
    title: 'Màn Hình LED Sân Khấu (YouTube Live)',
    tag: 'Live Screen',
    category: 'event',
    image: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=800&q=80',
    description: 'Màn hình LED concert siêu rộng 11.6m x 6.5m (tỷ lệ 16:9 IMAX) phát trực tiếp các buổi diễn acoustic, live concert, lofi chill theo yêu cầu qua link YouTube.',
    highlights: [
      'Hỗ trợ phát bất kỳ video / link YouTube nào',
      'Độ phân giải Full HD tỷ lệ chuẩn rạp phim',
      'Tùy chỉnh bật/tắt âm thanh và nguồn màn hình'
    ],
    actionText: 'Đổi Video Sân Khấu'
  },
  'boards': {
    title: 'Sân Khấu Live Acoustic & Đêm Nhạc',
    tag: 'Live Event',
    category: 'event',
    image: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=800&q=80',
    description: 'Trái tim của Ca Văn Nghệ: Sân khấu mộc mạc nơi các nghệ sĩ indie và ca sĩ hát live những giai điệu acoustic đầy xúc cảm từ 20:30 mỗi tối.',
    highlights: [
      'Thứ 4: Indie Acoustic & Ballad Việt',
      'Thứ 6: Jazz Night & Saxophone cổ điển',
      'Thứ 7: Ca Văn Nghệ Unplugged: Những bản tình ca vượt thời gian',
      'Chủ Nhật: Open Mic & Giao lưu cùng Nghệ sĩ'
    ],
    actionText: 'Đặt Chỗ Nghe Nhạc'
  },
  'statue': {
    title: 'Tác Phẩm Điêu Khắc Nghệ Thuật',
    tag: 'Art Collection',
    category: 'art',
    image: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=800&q=80',
    description: 'Bản sao điêu khắc nghệ thuật đương đại, biểu trưng cho tinh thần tự do và đam mê sáng tạo của không gian Ca Văn Nghệ.',
    actionText: 'Tìm Hiểu Thêm'
  }
};

export const FULL_MENU = {
  coffee: [
    { name: 'Cà phê Phin Ca Văn Nghệ', price: '45.000đ', note: 'Hạt Arabica Cầu Đất phối Robusta Đắk Lắk' },
    { name: 'Bạc Xỉu Sữa Tươi Kem Béo', price: '52.000đ', note: 'Vị ngọt thanh dịu dàng của sữa tươi thanh trùng' },
    { name: 'Caramel Macchiato Nóng/Đá', price: '65.000đ', note: 'Espresso đậm vị cùng caramel ngọt ngào' },
    { name: 'Cold Brew Cam Sả Thảo Mộc', price: '68.000đ', note: 'Ủ lạnh mượt mà, giải nhiệt tức thì' }
  ],
  cocktails: [
    { name: 'Sunset Ca Văn Nghệ Cocktail', price: '145.000đ', note: 'Gin hoa cúc, sen tây hồ, cam vàng' },
    { name: 'Smoked Bourbon Old Fashioned', price: '165.000đ', note: 'Bourbon hảo hạng hun khói gỗ sồi' },
    { name: 'Espresso Martini Signature', price: '135.000đ', note: 'Vodka cao cấp, Kahlua và shot Espresso nóng' },
    { name: 'Lychee Rose Gin Fizz', price: '125.000đ', note: 'Vải thiều ngâm hoa hồng, gin & soda chanh' }
  ],
  food: [
    { name: 'Wagyu Truffle Burger', price: '185.000đ', note: 'Bò Wagyu bơ tỏi, sốt nấm truffle đen' },
    { name: 'Pizza Nướng Củi Salame Piccante', price: '195.000đ', note: 'Đế bánh bột tươi ủ 48h, xúc xích Ý cay' },
    { name: 'Thăn Ngoại Bò Ribeye Bơ Thảo Mộc', price: '320.000đ', note: '250g Black Angus, khoai tây nghiền' },
    { name: 'Khoai Tây Múi Cau Chiên Bơ Tỏi', price: '75.000đ', note: 'Kèm sốt phô mai cay và tương cà thủ công' }
  ]
};
