import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const assetsToProcess = [
  {
    name: 'Reastaurant_Bar',
    outName: 'Restaurant_Bar',
    fbxId: '1xXHjyiHGK9TrUz0oVNTXp2Ut4Y-z_z6J',
    textures: [
      { id: '1oPLbr3Q6QVGZJSx8tJwCEZBLB-p8YnqC', name: 'M_Reastaurant_Bar_tex_AlbedoTransparency.png', type: 'albedo' },
      { id: '1UQMdK3-qhKwUCETgXbUPnkbm9KlSFtj2', name: 'M_Reastaurant_Bar_tex_Normal.png', type: 'normal' },
      { id: '1WjC0MvDUQDW1WI5lMvkuGDAJZbXD57hx', name: 'Reastaurant_Bar_Labels_tex_AlbedoTransparency.png', type: 'albedo2' }
    ]
  },
  {
    name: 'Winestand',
    outName: 'Winestand',
    fbxId: '1AmPftV481WZce99yr9ZyvPmohJ2l0tBn',
    textures: [
      { id: '1MFfqWorNA_8k4sH9ebYOBtBfTaEavmZr', name: 'Winestand_AlbedoTransparency.png', type: 'albedo' },
      { id: '1q5CqFfvgTRJE0GJrY80ITduBsfwrEIf2', name: 'Winestand_Normal.png', type: 'normal' }
    ]
  },
  {
    name: 'Restaurant_BarShelf_1',
    outName: 'Restaurant_BarShelf',
    fbxId: '1EomoRye47nm3UQ4XaCba9zL_zcnBQwrT',
    textures: [
      { id: '1JH42K5S7c63f63rilq2fetLyOrzEzIin', name: 'Restaurant_BarShelf_tex_AlbedoTransparency.png', type: 'albedo' },
      { id: '1pTri1n-BtfBa9QJzAsNbamQYdb1rDblJ', name: 'Restaurant_BarShelf_tex_Normal.png', type: 'normal' }
    ]
  },
  {
    name: 'Summer_Terrace_Table',
    outName: 'Summer_Terrace_Table',
    fbxId: '1fIieTEOB-s-caKHJ3nr32mjkqmt_yijj',
    textures: [
      { id: '1uaumFfwTBrI8kufBoaGqFDaMV1XES7Mn', name: 'Summer_Terrace_Table_tex_AlbedoTransparency.png', type: 'albedo' },
      { id: '1nD6XndZ4ym_93yjOzSEHz9zS6Cv2AB91', name: 'Summer_Terrace_Table_tex_Normal.png', type: 'normal' }
    ]
  },
  {
    name: 'Restaurant_chair',
    outName: 'Restaurant_chair',
    fbxId: '1ref9FcMAdtiqBcVNNPsIldE3VgRli9Xm',
    textures: [
      { id: '1rDIzZElMwJhSGjfthE6eHQFZ7RnM8KDB', name: 'Restaurant_chair_tex_AlbedoTransparency.png', type: 'albedo' },
      { id: '1QbkBd-_BprPmv_ET2F-rlLpBMnjenhqK', name: 'Restaurant_chair_tex_Normal.png', type: 'normal' }
    ]
  },
  {
    name: 'Burger',
    outName: 'Burger',
    fbxId: '1PxxP1wSxzkCTq_LIzQ1ZkZ3JiWMJVtTy',
    textures: [
      { id: '1qXrWACniaBbDuVNwnGcIo86Ybwp7O9YQ', name: 'T_M_Burger_AlbedoTransparency.png', type: 'albedo' },
      { id: '1uhC8Bi_df994kkxzGb-zQZdMYDMJEu4R', name: 'T_M_Burger_Normal.png', type: 'normal' }
    ]
  },
  {
    name: 'Pizza',
    outName: 'Pizza',
    fbxId: '16u3_LxYmwb8Uu_WSy_eUFp3wvGJBwTJB',
    textures: [
      { id: '1sZgtLKozo0x_urnTAnfgxIjShYcxpki3', name: 'Pizza_tex_AlbedoTransparency.png', type: 'albedo' },
      { id: '18uk_OoqXcDkHOdqcHoCLRfQqjIE2AGiV', name: 'Pizza_tex_Normal.png', type: 'normal' }
    ]
  },
  {
    name: 'Steak',
    outName: 'Steak',
    fbxId: '192sghZtvf_1eatLkS4aJLvkvX2l2MIpI',
    textures: [
      { id: '1_xcKPD75kT0ClGQB4N0v35W6re4L2bWY', name: 'T_M_Steak_AlbedoTransparency.png', type: 'albedo' },
      { id: '1IxWdsNdiSpsRSy2GQ430_nmirGaeJp65', name: 'T_M_Steak_Normal.png', type: 'normal' }
    ]
  },
  {
    name: 'Boards',
    outName: 'Boards',
    fbxId: '1-Z6EkZsdKkWygqkqYL8iBBbJymI_y0Vx',
    textures: [
      { id: '14IJ0t-LqbWL2D3MoB7XporXbLjnx1D_U', name: 'Boards_tex_AlbedoTransparency.png', type: 'albedo' },
      { id: '173OBDtCU_WyxBlX-gRO04RUESTSMi7zH', name: 'Boards_tex_Normal.png', type: 'normal' }
    ]
  },
  {
    name: 'statue',
    outName: 'statue',
    fbxId: '16jBHaZSpxkAVraF2ZYL1NcphkLkJC1zw',
    textures: [
      { id: '17oLQoNGRJvtYpI9qC9N2Mnc7voOeHHDW', name: 'statue_tex_AlbedoTransparency.png', type: 'albedo' },
      { id: '1T6XMnhEohlN5S4EME95IkgVMHzQ_vXvc', name: 'statue_tex_Normal.png', type: 'normal' }
    ]
  },
  {
    name: 'Restaurant_Divider',
    outName: 'Restaurant_Divider',
    fbxId: '1ICugvvQxDJfuqnXw-sZlvmboClhIdy5N',
    textures: [
      { id: '1isaVhglJo1Ov6_Wv3_WkacaNKnEs_FDz', name: 'Restaurant_Divider_tex_AlbedoTransparency.png', type: 'albedo' },
      { id: '1G6LMSggy13OWbtrXnjkK4gVGajnu4f43', name: 'Restaurant_Divider_tex_Normal.png', type: 'normal' }
    ]
  },
  {
    name: 'Summer_Terrace_Floor_Lamp_2',
    outName: 'Floor_Lamp',
    fbxId: '1A1PVL78dy_oPsfmUMmLAZcxL6YPSni7m',
    textures: [
      { id: '1wZb_DfH2pB8SLu584Vmg8raDXMQw0jpl', name: 'Summer_Terrace_Floor_Lamp_2_tex_Normal.png', type: 'normal' },
      { id: '1IUMi6ycvS1_KnKAwbbD2sYfkVECW0vXo', name: 'Summer_Terrace_Floor_Lamp_2_tex_Emission.png', type: 'emission' }
    ]
  },
  {
    name: 'Bar_props',
    outName: 'Bar_props',
    fbxId: '11BulJzwO5UNChoowteVHiTf3hotYXa1h',
    textures: [
      { id: '1e67eMRNufUWCiM48Ea7STRwIQghn9uGn', name: 'Bottle_tex_AlbedoTransparency.png', type: 'albedo' },
      { id: '1gjvtJYapyKjG79sPSYpykg1vXz1OzghC', name: 'Bottle_tex_Normal.png', type: 'normal' }
    ]
  }
];

fs.mkdirSync('raw_assets/fbx', { recursive: true });
fs.mkdirSync('raw_assets/textures', { recursive: true });
fs.mkdirSync('public/models', { recursive: true });

console.log('Downloading assets from Google Drive...');

for (const item of assetsToProcess) {
  const fbxPath = path.join('raw_assets/fbx', `${item.name}.fbx`);
  if (!fs.existsSync(fbxPath)) {
    console.log(`Downloading FBX: ${item.name}...`);
    execSync(`gdrive readonly download ${item.fbxId} --out "${fbxPath}"`, { stdio: 'inherit' });
  }

  for (const tex of item.textures) {
    const texPath = path.join('raw_assets/textures', tex.name);
    if (!fs.existsSync(texPath)) {
      console.log(`Downloading Texture: ${tex.name}...`);
      execSync(`gdrive readonly download ${tex.id} --out "${texPath}"`, { stdio: 'inherit' });
    }
  }
}

console.log('All downloads completed! Now converting to GLB with Blender...');

// Write Blender conversion python script
const blenderScript = `
import bpy, os, sys

def convert_fbx(fbx_path, out_glb_path, tex_dir):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=fbx_path)
    
    # Scan texture dir for potential textures
    tex_files = os.listdir(tex_dir) if os.path.exists(tex_dir) else []
    
    base_name = os.path.splitext(os.path.basename(fbx_path))[0].lower()
    
    for mat in bpy.data.materials:
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        nodes.clear()
        
        output_node = nodes.new(type='ShaderNodeOutputMaterial')
        bsdf_node = nodes.new(type='ShaderNodeBsdfPrincipled')
        links.new(bsdf_node.outputs['BSDF'], output_node.inputs['Surface'])
        
        # Set default roughness & metallic
        if 'Roughness' in bsdf_node.inputs:
            bsdf_node.inputs['Roughness'].default_value = 0.35
        if 'Metallic' in bsdf_node.inputs:
            bsdf_node.inputs['Metallic'].default_value = 0.1
            
        mat_name = mat.name.lower()
        
        # Find best albedo texture
        albedo_file = None
        normal_file = None
        emission_file = None
        
        for f in tex_files:
            fl = f.lower()
            if not fl.endswith('.png'):
                continue
            
            # Check match with mat_name or base_name
            is_match = False
            if mat_name in fl or base_name in fl:
                is_match = True
            elif 'burger' in base_name and 'burger' in fl:
                is_match = True
            elif 'steak' in base_name and 'steak' in fl:
                is_match = True
            elif 'pizza' in base_name and 'pizza' in fl:
                is_match = True
            elif 'bar_props' in base_name and 'bottle' in fl:
                is_match = True
            elif 'shelf' in base_name and 'barshelf' in fl:
                is_match = True
            elif 'winestand' in base_name and 'winestand' in fl:
                is_match = True
            elif 'divider' in base_name and 'divider' in fl:
                is_match = True
            elif 'statue' in base_name and 'statue' in fl:
                is_match = True
            elif 'floor_lamp' in base_name and 'floor_lamp' in fl:
                is_match = True
            elif 'boards' in base_name and 'boards' in fl and 'cutting' not in fl:
                is_match = True
            elif 'summer_terrace_table' in base_name and 'terrace_table' in fl:
                is_match = True
            elif 'restaurant_chair' in base_name and 'restaurant_chair' in fl:
                is_match = True
            elif 'bar' in base_name and 'bar' in fl:
                if 'label' in mat_name and 'label' in fl:
                    is_match = True
                elif 'label' not in mat_name and 'label' not in fl:
                    is_match = True
                    
            if is_match:
                if 'albedotransparency' in fl or 'color' in fl:
                    albedo_file = f
                elif 'normal' in fl:
                    normal_file = f
                elif 'emission' in fl:
                    emission_file = f

        if albedo_file:
            ap = os.path.abspath(os.path.join(tex_dir, albedo_file))
            tex_node = nodes.new(type='ShaderNodeTexImage')
            tex_node.image = bpy.data.images.load(ap)
            links.new(tex_node.outputs['Color'], bsdf_node.inputs['Base Color'])
            
        if normal_file:
            np_ = os.path.abspath(os.path.join(tex_dir, normal_file))
            norm_tex = nodes.new(type='ShaderNodeTexImage')
            norm_img = bpy.data.images.load(np_)
            norm_img.colorspace_settings.name = 'Non-Color'
            norm_tex.image = norm_img
            
            norm_map = nodes.new(type='ShaderNodeNormalMap')
            links.new(norm_tex.outputs['Color'], norm_map.inputs['Color'])
            links.new(norm_map.outputs['Normal'], bsdf_node.inputs['Normal'])
            
        if emission_file:
            ep = os.path.abspath(os.path.join(tex_dir, emission_file))
            em_tex = nodes.new(type='ShaderNodeTexImage')
            em_tex.image = bpy.data.images.load(ep)
            if 'Emission Color' in bsdf_node.inputs:
                links.new(em_tex.outputs['Color'], bsdf_node.inputs['Emission Color'])
                if 'Emission Strength' in bsdf_node.inputs:
                    bsdf_node.inputs['Emission Strength'].default_value = 2.0
            elif 'Emission' in bsdf_node.inputs:
                links.new(em_tex.outputs['Color'], bsdf_node.inputs['Emission'])

    bpy.ops.export_scene.gltf(filepath=out_glb_path, export_format='GLB')
    print(f'Successfully converted: {out_glb_path}')

# Read args passed after --
argv = sys.argv
if '--' in argv:
    args = argv[argv.index('--') + 1:]
    convert_fbx(args[0], args[1], args[2])
`;

fs.writeFileSync('scripts/convert_headless.py', blenderScript);

for (const item of assetsToProcess) {
  const fbxPath = path.resolve('raw_assets/fbx', `${item.name}.fbx`);
  const glbPath = path.resolve('public/models', `${item.outName}.glb`);
  const texDir = path.resolve('raw_assets/textures');
  
  console.log(`Converting ${item.name} -> ${item.outName}.glb`);
  try {
    execSync(`/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/convert_headless.py -- "${fbxPath}" "${glbPath}" "${texDir}"`, { stdio: 'inherit' });
  } catch (err) {
    console.error(`Failed to convert ${item.name}:`, err.message);
  }
}

console.log('Batch conversion complete!');

