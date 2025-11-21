/**
 * AI Automod - AI Automod for Reddit
 * Copyright (C) 2025 CoinsTax LLC
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Mock Devvit Context and Utilities for Local Testing
 *
 * Provides mock implementations of Devvit APIs to enable
 * unit testing without Reddit deployment.
 */

export class MockRedis {
  private store: Map<string, any> = new Map();

  async get(key: string): Promise<any> {
    return this.store.get(key) || null;
  }

  async set(key: string, value: any, options?: { ttl?: number }): Promise<void> {
    this.store.set(key, value);
    if (options?.ttl) {
      // In real implementation, would expire after TTL
      // For tests, just store it
    }
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  // Sorted Set operations (camelCase to match Devvit API)
  async zAdd(key: string, ...members: Array<{ member: string; score: number }>): Promise<void> {
    const set = this.store.get(key) || [];
    for (const item of members) {
      // Remove existing member if present (to update score)
      const existing = set.findIndex((s: any) => s.member === item.member);
      if (existing >= 0) {
        set.splice(existing, 1);
      }
      set.push({ score: item.score, member: item.member });
    }
    this.store.set(key, set);
  }

  async zRange(
    key: string,
    start: number,
    stop: number,
    options?: { by?: 'rank' | 'score'; reverse?: boolean }
  ): Promise<Array<{ member: string; score: number }>> {
    let set = this.store.get(key) || [];

    // Sort by score (ascending by default)
    set = set.sort((a: any, b: any) => a.score - b.score);

    // If reverse, sort descending
    if (options?.reverse) {
      set = set.reverse();
    }

    // Handle negative indices (like Python)
    const length = set.length;
    const startIdx = start < 0 ? Math.max(0, length + start) : start;
    const stopIdx = stop < 0 ? Math.max(0, length + stop + 1) : stop + 1;

    // Return slice
    return set.slice(startIdx, stopIdx);
  }

  async zRem(key: string, members: string[]): Promise<void> {
    const set = this.store.get(key) || [];
    this.store.set(
      key,
      set.filter((item: any) => !members.includes(item.member))
    );
  }

  // Test utility: Clear all data
  clear(): void {
    this.store.clear();
  }

  // Test utility: Get all keys
  keys(): string[] {
    return Array.from(this.store.keys());
  }
}

export class MockSettings {
  private settings: Map<string, any> = new Map();

  constructor(defaults: Record<string, any> = {}) {
    Object.entries(defaults).forEach(([key, value]) => {
      this.settings.set(key, value);
    });
  }

  get(key: string): any {
    return this.settings.get(key);
  }

  getAll(): Record<string, any> {
    const all: Record<string, any> = {};
    this.settings.forEach((value, key) => {
      all[key] = value;
    });
    return all;
  }

  // Test utility: Set a setting
  set(key: string, value: any): void {
    this.settings.set(key, value);
  }
}

export class MockRedditAPI {
  async getCurrentUser() {
    return {
      username: 'test-bot',
      id: 't2_testbot',
    };
  }

  async getPostById(id: string) {
    return {
      id,
      removed: false,
      spam: false,
      authorId: 't2_testuser',
      subredditName: 'test',
    };
  }

  async getUserById(id: string) {
    return {
      id,
      username: 'testuser',
      createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year old
      commentKarma: 1000,
      postKarma: 500,
    };
  }

  async report(_post: any, _options: { reason: string }) {
    // Mock report - just return success
    return { success: true };
  }

  async remove(_postId: string) {
    // Mock removal
    return { success: true };
  }

  async submitComment(options: { postId: string; text: string }) {
    return {
      id: 't1_mockcomment',
      body: options.text,
    };
  }
}

export class MockContext {
  redis: MockRedis;
  settings: MockSettings;
  reddit: MockRedditAPI;

  constructor(settingsDefaults: Record<string, any> = {}) {
    this.redis = new MockRedis();
    this.settings = new MockSettings(settingsDefaults);
    this.reddit = new MockRedditAPI();
  }

  // Test utility: Reset all state
  reset(): void {
    this.redis.clear();
  }
}

/**
 * Helper to create mock posts for testing
 */
export function createMockPost(options: {
  id?: string;
  author?: string;
  subreddit?: string;
  title?: string;
  body?: string;
  url?: string;
  createdAt?: Date;
} = {}) {
  return {
    id: options.id || 't3_test123',
    authorId: `t2_${options.author || 'testuser'}`,
    author: options.author || 'testuser',
    subredditName: options.subreddit || 'test',
    title: options.title || 'Test Post',
    body: options.body || 'This is a test post',
    url: options.url || 'https://reddit.com/r/test/comments/test123',
    createdAt: options.createdAt || new Date(),
  };
}

/**
 * Helper to create mock comments for testing
 */
export function createMockComment(options: {
  id?: string;
  author?: string;
  subreddit?: string;
  body?: string;
  createdAt?: Date;
} = {}) {
  return {
    id: options.id || 't1_test123',
    authorId: `t2_${options.author || 'testuser'}`,
    author: options.author || 'testuser',
    subredditName: options.subreddit || 'test',
    body: options.body || 'This is a test comment',
    createdAt: options.createdAt || new Date(),
  };
}

/**
 * Helper to simulate ModAction events
 */
export function createMockModAction(options: {
  action: 'removelink' | 'spamlink' | 'removecomment' | 'spamcomment';
  targetId: string;
  moderator?: string;
  subreddit?: string;
}) {
  return {
    action: options.action,
    actionedAt: new Date(),
    subreddit: {
      name: options.subreddit || 'test',
    },
    moderator: {
      username: options.moderator || 'testmod',
    },
    targetPost: options.action.includes('link') ? { id: options.targetId } : undefined,
    targetComment: options.action.includes('comment') ? { id: options.targetId } : undefined,
  };
}
