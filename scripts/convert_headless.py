
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
