import { getSupabaseClient } from './supabaseClient';
import { DebugLogger } from '../utils/debugLogger';

export interface AdminAccount {
  id: string;
  user_id: string | null;
  username: string;
  display_name: string;
  role: 'admin' | 'player';
  is_active: boolean;
  avatar_color?: string;
  created_at: string;
}

export interface AppSettings {
  max_total_players: number;
  max_players_per_room: number;
  updated_at?: string;
}

export interface ActiveRoomInfo {
  room_id: string;
  room_name: string;
  host_name: string;
  scene_id: string;
  has_password: boolean;
  player_count: number;
  last_active_at: string;
}

export interface RoomPlayerInfo {
  room_id: string;
  player_id: string;
  player_name: string;
  device_id?: string | null;
  scene_id: string;
  is_host: boolean;
  is_admin: boolean;
  joined_at: string;
  last_seen_at: string;
}

export interface BannedPlayerInfo {
  id: string;
  room_id: string;
  player_id: string | null;
  player_name: string;
  device_id?: string | null;
  reason: string;
  is_active: boolean;
  created_at: string;
}

export interface ServerAnnouncementPayload {
  id: string;
  message: string;
  senderName: string;
  createdAt: number;
}

export interface JoinCheckResult {
  allowed: boolean;
  reason?: string;
  maxPlayersPerRoom: number;
  maxTotalPlayers: number;
}

export const AdminService = {
  getOrCreateDeviceId(): string {
    const key = 'cavannghe:device-id';
    try {
      const existing = localStorage.getItem(key);
      if (existing) return existing;
      const generated =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(key, generated);
      return generated;
    } catch {
      return `dev_${Math.random().toString(36).slice(2, 10)}`;
    }
  },

  async getCurrentAdminAccount(): Promise<AdminAccount | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) return null;

    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) return null;
    return data as AdminAccount;
  },

  async signInAdmin(identifier: string, password: string): Promise<{ account?: AdminAccount; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { error: 'Chưa cấu hình Supabase.' };

    let loginEmail = identifier.trim();
    if (!loginEmail.includes('@')) {
      const { data: resolved } = await supabase.rpc('resolve_admin_login_email', {
        p_identifier: loginEmail,
      });
      if (!resolved) {
        return { error: 'Không tìm thấy tài khoản Admin.' };
      }
      loginEmail = String(resolved);
    }

    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    });
    if (authErr) {
      return { error: authErr.message || 'Sai tài khoản hoặc mật khẩu.' };
    }

    const account = await this.getCurrentAdminAccount();
    if (!account) {
      await supabase.auth.signOut();
      return { error: 'Tài khoản này không có quyền Admin.' };
    }
    return { account };
  },

  async signOutAdmin(): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    await supabase.auth.signOut();
  },

  getSavedPlayerAccount(): AdminAccount | null {
    try {
      const raw = localStorage.getItem('cavannghe:player-account');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as AdminAccount;
      if (parsed && parsed.id && parsed.username) return parsed;
    } catch {
      // ignore storage errors
    }
    return null;
  },

  savePlayerAccount(account: AdminAccount): void {
    try {
      localStorage.setItem('cavannghe:player-account', JSON.stringify(account));
      localStorage.setItem('cavannghe:player-name', account.display_name || account.username);
      if (account.avatar_color) {
        localStorage.setItem('cavannghe:avatar-color', account.avatar_color);
      }
    } catch {
      // ignore storage errors
    }
  },

  clearPlayerAccount(): void {
    try {
      localStorage.removeItem('cavannghe:player-account');
    } catch {
      // ignore
    }
  },

  async registerPlayerAccount(
    username: string,
    password: string,
    displayName: string,
    avatarColor = '#e8a246'
  ): Promise<{ account?: AdminAccount; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { error: 'Chưa cấu hình Supabase.' };

    const { data, error } = await supabase.rpc('register_player_account', {
      p_username: username.trim(),
      p_password: password,
      p_display_name: displayName.trim(),
      p_avatar_color: avatarColor,
    });

    if (error) {
      return { error: error.message || 'Không thể đăng ký tài khoản.' };
    }
    const res = data as { account?: AdminAccount; error?: string } | null;
    if (res?.error) {
      return { error: res.error };
    }
    if (res?.account) {
      this.savePlayerAccount(res.account);
      return { account: res.account };
    }
    return { error: 'Đăng ký thất bại.' };
  },

  async loginPlayerAccount(
    username: string,
    password: string
  ): Promise<{ account?: AdminAccount; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { error: 'Chưa cấu hình Supabase.' };

    const cleanUser = username.trim();
    const { data, error } = await supabase.rpc('login_player_account', {
      p_username: cleanUser,
      p_password: password,
    });

    if (error) {
      return { error: error.message || 'Không thể đăng nhập.' };
    }
    const res = data as {
      account?: AdminAccount;
      error?: string;
      use_admin_auth?: boolean;
    } | null;

    if (res?.use_admin_auth) {
      const adminRes = await this.signInAdmin(cleanUser, password);
      if (adminRes.account) {
        this.savePlayerAccount(adminRes.account);
      }
      return adminRes;
    }
    if (res?.error) {
      return { error: res.error };
    }
    if (res?.account) {
      this.savePlayerAccount(res.account);
      return { account: res.account };
    }
    return { error: 'Sai tên đăng nhập hoặc mật khẩu.' };
  },

  async updatePlayerAvatarColor(accountId: string, color: string): Promise<void> {
    const supabase = getSupabaseClient();
    const saved = this.getSavedPlayerAccount();
    if (saved && saved.id === accountId) {
      this.savePlayerAccount({ ...saved, avatar_color: color });
    }
    if (!supabase || !accountId) return;
    await supabase.rpc('update_player_avatar_color', {
      p_account_id: accountId,
      p_avatar_color: color,
    });
  },

  async fetchAppSettings(): Promise<AppSettings> {
    const supabase = getSupabaseClient();
    if (!supabase) return { max_total_players: 50, max_players_per_room: 10 };
    const { data, error } = await supabase
      .from('app_settings')
      .select('max_total_players, max_players_per_room, updated_at')
      .eq('id', 1)
      .maybeSingle();

    if (error || !data) {
      return { max_total_players: 50, max_players_per_room: 10 };
    }
    return data as AppSettings;
  },

  async updateAppSettings(
    maxTotalPlayers: number,
    maxPlayersPerRoom: number,
    adminAccountId?: string
  ): Promise<{ ok: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { ok: false, error: 'Chưa cấu hình Supabase.' };

    const { error } = await supabase
      .from('app_settings')
      .update({
        max_total_players: Math.max(1, Math.round(maxTotalPlayers)),
        max_players_per_room: Math.max(1, Math.round(maxPlayersPerRoom)),
        updated_by: adminAccountId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  async fetchKaraokeCookiesInfo(): Promise<{
    hasCookies: boolean;
    lineCount: number;
    updatedAt: string | null;
  }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { hasCookies: false, lineCount: 0, updatedAt: null };
    const { data, error } = await supabase
      .from('karaoke_server_secrets')
      .select('ytdlp_cookies, updated_at')
      .eq('id', 1)
      .maybeSingle();

    if (error || !data) {
      return { hasCookies: false, lineCount: 0, updatedAt: null };
    }
    const raw = typeof data.ytdlp_cookies === 'string' ? data.ytdlp_cookies.trim() : '';
    const lineCount = raw
      ? raw.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#')).length
      : 0;
    return {
      hasCookies: raw.length > 0,
      lineCount,
      updatedAt: (data.updated_at as string | null) ?? null,
    };
  },

  async updateKaraokeCookies(
    cookiesText: string,
    adminAccountId?: string
  ): Promise<{ ok: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { ok: false, error: 'Chưa cấu hình Supabase.' };

    const { error } = await supabase
      .from('karaoke_server_secrets')
      .upsert({
        id: 1,
        ytdlp_cookies: cookiesText.trim(),
        updated_by: adminAccountId ?? null,
        updated_at: new Date().toISOString(),
      });

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  async fetchActiveRooms(): Promise<ActiveRoomInfo[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const cutoff = new Date(Date.now() - 45 * 1000).toISOString();
    const { data, error } = await supabase
      .from('active_rooms')
      .select('*')
      .gt('player_count', 0)
      .gte('last_active_at', cutoff)
      .order('last_active_at', { ascending: false });

    if (error) {
      DebugLogger.error('AdminService', 'fetchActiveRooms failed:', error.message);
      return [];
    }
    if (!data) return [];
    return data as ActiveRoomInfo[];
  },

  async deleteRoom(
    roomId: string,
    fallbackHostName = '',
    sceneId = 'ca-van-nghe-lobby'
  ): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    await supabase.from('room_players').delete().eq('room_id', roomId);
    const { error } = await supabase.from('active_rooms').delete().eq('room_id', roomId);
    if (error) {
      DebugLogger.warn(
        'AdminService',
        `active_rooms delete failed for "${roomId}" (${error.message}), falling back to playerCount=0`
      );
      await this.upsertRoomHeartbeat({
        roomId,
        hostName: fallbackHostName,
        sceneId,
        playerCount: 0,
      });
    }
  },

  async closeOwnedRoom(
    roomId: string,
    hostName: string,
    sceneId = 'ca-van-nghe-lobby'
  ): Promise<void> {
    await this.deleteRoom(roomId, hostName, sceneId);
  },

  async fetchAccounts(): Promise<AdminAccount[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .order('created_at', { ascending: true });

    if (error || !data) return [];
    return data as AdminAccount[];
  },

  async upsertRoomHeartbeat(params: {
    roomId: string;
    roomName?: string;
    hostName: string;
    sceneId: string;
    playerCount: number;
    hasPassword?: boolean;
    password?: string;
  }): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase.rpc('upsert_room_heartbeat', {
      p_room_id: params.roomId,
      p_room_name: params.roomName || params.roomId,
      p_host_name: params.hostName,
      p_scene_id: params.sceneId || 'ca-van-nghe-lobby',
      p_player_count: params.playerCount,
      p_has_password: Boolean(params.hasPassword),
      p_password: params.password?.trim() || null,
    });
    if (error) {
      DebugLogger.error(
        'AdminService',
        `upsert_room_heartbeat failed for room "${params.roomId}": ${error.message}`
      );
    }
  },

  async checkCanJoinRoom(
    roomId: string,
    password: string,
    isAdminBypass: boolean,
    playerId?: string,
    playerName?: string,
    deviceId?: string
  ): Promise<JoinCheckResult> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { allowed: true, maxPlayersPerRoom: 10, maxTotalPlayers: 50 };
    }

    const { data: capRows } = await supabase.rpc('get_server_capacity');
    const cap = Array.isArray(capRows) ? capRows[0] : capRows;
    const maxTotal = Number(cap?.max_total_players ?? 50);
    const maxPerRoom = Number(cap?.max_players_per_room ?? 10);
    const currentTotal = Number(cap?.current_total_players ?? 0);

    if (isAdminBypass) {
      return { allowed: true, maxPlayersPerRoom: maxPerRoom, maxTotalPlayers: maxTotal };
    }

    // Check active ban list (room-specific or global '*')
    const { data: bans } = await supabase
      .from('banned_players')
      .select('id, room_id, player_id, player_name, device_id, reason')
      .eq('is_active', true)
      .in('room_id', [roomId, '*']);

    if (Array.isArray(bans) && bans.length > 0) {
      const cleanName = (playerName || '').trim().toLowerCase();
      const targetDevice = deviceId || this.getOrCreateDeviceId();
      const matched = bans.find(
        (b) =>
          (targetDevice && b.device_id && b.device_id === targetDevice) ||
          (playerId && b.player_id === playerId) ||
          (cleanName && b.player_name.trim().toLowerCase() === cleanName)
      );
      if (matched) {
        return {
          allowed: false,
          reason: `Thiết bị hoặc tài khoản của bạn đã bị Admin cấm vào phòng (${matched.reason || 'Vi phạm quy định'}).`,
          maxPlayersPerRoom: maxPerRoom,
          maxTotalPlayers: maxTotal,
        };
      }
    }

    const cutoff = new Date(Date.now() - 45 * 1000).toISOString();
    const { data: roomRow } = await supabase
      .from('active_rooms')
      .select('player_count, has_password, host_name')
      .eq('room_id', roomId)
      .gte('last_active_at', cutoff)
      .maybeSingle();

    const isOwnReclaim = Boolean(
      roomRow &&
        playerName &&
        roomRow.host_name &&
        roomRow.host_name.trim().toLowerCase() === playerName.trim().toLowerCase() &&
        Number(roomRow.player_count) <= 1
    );

    if (!isOwnReclaim) {
      if (currentTotal >= maxTotal) {
        const liveRooms = await this.fetchActiveRooms();
        const liveTotal = liveRooms.reduce((sum, r) => sum + Number(r.player_count || 0), 0);
        if (liveTotal >= maxTotal) {
          return {
            allowed: false,
            reason: `Hệ thống đã đạt giới hạn tối đa (${liveTotal}/${maxTotal} người chơi).`,
            maxPlayersPerRoom: maxPerRoom,
            maxTotalPlayers: maxTotal,
          };
        }
      }

      if (roomRow && Number(roomRow.player_count) >= maxPerRoom) {
        return {
          allowed: false,
          reason: `Phòng "${roomId}" đã đầy (${roomRow.player_count}/${maxPerRoom} người).`,
          maxPlayersPerRoom: maxPerRoom,
          maxTotalPlayers: maxTotal,
        };
      }

      if (roomRow?.has_password) {
        const { data: passOk } = await supabase.rpc('verify_room_password', {
          p_room_id: roomId,
          p_password: password.trim(),
        });
        if (!passOk) {
          return {
            allowed: false,
            reason: 'Mật khẩu phòng không đúng.',
            maxPlayersPerRoom: maxPerRoom,
            maxTotalPlayers: maxTotal,
          };
        }
      }
    }

    return { allowed: true, maxPlayersPerRoom: maxPerRoom, maxTotalPlayers: maxTotal };
  },

  async upsertRoomPlayer(params: {
    roomId: string;
    playerId: string;
    playerName: string;
    deviceId?: string;
    sceneId: string;
    isHost: boolean;
    isAdmin: boolean;
  }): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase.rpc('upsert_room_player', {
      p_room_id: params.roomId,
      p_player_id: params.playerId,
      p_player_name: params.playerName,
      p_scene_id: params.sceneId || 'ca-van-nghe-lobby',
      p_is_host: params.isHost,
      p_is_admin: params.isAdmin,
      p_device_id: params.deviceId ?? this.getOrCreateDeviceId(),
    });
    if (error) {
      DebugLogger.error(
        'AdminService',
        `upsert_room_player failed (${params.roomId}/${params.playerId}): ${error.message}`
      );
    }
  },

  async removeRoomPlayer(roomId: string, playerId: string): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase.rpc('remove_room_player', {
      p_room_id: roomId,
      p_player_id: playerId,
    });
    if (error) {
      DebugLogger.warn(
        'AdminService',
        `remove_room_player failed (${roomId}/${playerId}): ${error.message}`
      );
    }
  },

  async demoteRoomHost(roomId: string, playerId: string): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase
      .from('room_players')
      .update({ is_host: false })
      .eq('room_id', roomId)
      .eq('player_id', playerId);
    if (error) {
      DebugLogger.warn(
        'AdminService',
        `demoteRoomHost failed (${roomId}/${playerId}): ${error.message}`
      );
    }
  },

  async transferRoomHost(params: {
    roomId: string;
    newHostId: string;
    newHostName: string;
    sceneId: string;
    playerCount: number;
    hasPassword?: boolean;
    password?: string;
  }): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    await supabase
      .from('room_players')
      .update({ is_host: true })
      .eq('room_id', params.roomId)
      .eq('player_id', params.newHostId);
    await this.upsertRoomHeartbeat({
      roomId: params.roomId,
      roomName: params.roomId,
      hostName: params.newHostName,
      sceneId: params.sceneId || 'ca-van-nghe-lobby',
      playerCount: Math.max(1, params.playerCount),
      hasPassword: params.hasPassword,
      password: params.password,
    });
  },

  async fetchRoomPlayers(roomId?: string): Promise<RoomPlayerInfo[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const cutoff = new Date(Date.now() - 45 * 1000).toISOString();
    let q = supabase
      .from('room_players')
      .select('*')
      .gte('last_seen_at', cutoff)
      .order('joined_at', { ascending: true });
    if (roomId) {
      q = q.eq('room_id', roomId);
    }
    const { data, error } = await q;
    if (error) {
      DebugLogger.error('AdminService', 'fetchRoomPlayers failed:', error.message);
      return [];
    }
    if (!data) return [];
    return data as RoomPlayerInfo[];
  },

  async fetchBannedPlayers(): Promise<BannedPlayerInfo[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('banned_players')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return data as BannedPlayerInfo[];
  },

  async kickOrBanPlayer(params: {
    action: 'kick' | 'ban';
    roomId: string;
    sceneId: string;
    playerId: string;
    playerName: string;
    deviceId?: string | null;
    isHost?: boolean;
    reason?: string;
    adminAccountId?: string;
  }): Promise<{ ok: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { ok: false, error: 'Chưa cấu hình Supabase.' };

    const cleanReason =
      params.reason?.trim() ||
      (params.action === 'ban' ? 'Bị Admin cấm vào phòng' : 'Bị Admin mời ra khỏi phòng');

    if (params.action === 'ban') {
      const { error: banErr } = await supabase.from('banned_players').insert({
        room_id: params.roomId,
        player_id: params.playerId,
        player_name: params.playerName,
        device_id: params.deviceId ?? null,
        reason: cleanReason,
        banned_by: params.adminAccountId ?? null,
        is_active: true,
      });
      if (banErr) {
        return { ok: false, error: banErr.message };
      }
    }

    const closeRoom = Boolean(params.isHost);
    if (closeRoom) {
      await this.deleteRoom(
        params.roomId,
        params.playerName,
        params.sceneId || 'ca-van-nghe-lobby'
      );
    } else {
      await this.removeRoomPlayer(params.roomId, params.playerId);
    }

    // Broadcast kick/ban signal directly to the target player's active Realtime channel
    const topics = Array.from(
      new Set([
        params.sceneId ? `room:${params.roomId}:${params.sceneId}` : `room:${params.roomId}`,
        `room:${params.roomId}:ca-van-nghe-lobby`,
        `room:${params.roomId}:ca-van-nghe-cinema`,
        `room:${params.roomId}:ca-van-nghe-tearoom`,
      ])
    );

    await Promise.all(
      topics.map(
        (topic) =>
          new Promise<void>((resolve) => {
            const ch = supabase.channel(topic);
            const timeout = window.setTimeout(() => {
              void ch.unsubscribe();
              resolve();
            }, 2500);
            ch.subscribe(async (status) => {
              if (status === 'SUBSCRIBED') {
                await ch.send({
                  type: 'broadcast',
                  event: 'admin:moderation',
                  payload: {
                    action: params.action,
                    targetPlayerId: closeRoom ? '*' : params.playerId,
                    hostPlayerId: closeRoom ? params.playerId : undefined,
                    closeRoom,
                    targetPlayerName: params.playerName,
                    reason: cleanReason,
                  },
                });
                window.clearTimeout(timeout);
                await ch.unsubscribe();
                resolve();
              } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                window.clearTimeout(timeout);
                resolve();
              }
            });
          })
      )
    );

    return { ok: true };
  },

  async unbanPlayer(banId: string): Promise<{ ok: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { ok: false, error: 'Chưa cấu hình Supabase.' };
    const { error } = await supabase
      .from('banned_players')
      .update({ is_active: false })
      .eq('id', banId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  async sendServerAnnouncement(
    message: string,
    senderName: string
  ): Promise<{ ok: boolean; error?: string }> {
    const clean = message.trim();
    if (!clean) return { ok: false, error: 'Vui lòng nhập nội dung thông báo.' };

    const supabase = getSupabaseClient();
    if (!supabase) return { ok: false, error: 'Chưa cấu hình Supabase.' };

    await supabase
      .from('app_settings')
      .update({
        server_notice: clean,
        server_notice_by: senderName,
        server_notice_at: new Date().toISOString(),
      })
      .eq('id', 1);

    const payload: ServerAnnouncementPayload = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      message: clean,
      senderName: senderName || 'Admin',
      createdAt: Date.now(),
    };

    return new Promise((resolve) => {
      const ch = supabase.channel('server:announcements');
      const timeout = window.setTimeout(() => {
        void ch.unsubscribe();
        resolve({ ok: false, error: 'Hết thời gian kết nối Supabase Realtime.' });
      }, 4000);

      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.send({
            type: 'broadcast',
            event: 'announcement',
            payload,
          });
          window.clearTimeout(timeout);
          await ch.unsubscribe();
          resolve({ ok: true });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          window.clearTimeout(timeout);
          resolve({ ok: false, error: 'Không thể gửi thông báo tới kênh Realtime.' });
        }
      });
    });
  },
};
