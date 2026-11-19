/**
 * GitHub Feeds API
 * @module api/feeds
 */

import type { HttpClient } from '../client/http.js';
import type { Feed } from '../models/types.js';

/**
 * A single available feed descriptor.
 */
export interface AvailableFeed {
  name: string;
  type: string;
  url: string;
  public: boolean;
}

/**
 * Feed metadata summary.
 */
export interface FeedMetadata {
  hasTimeline: boolean;
  hasUserFeed: boolean;
  hasCurrentUserPublic: boolean;
  hasCurrentUserPrivate: boolean;
  hasCurrentUserActor: boolean;
  hasOrganizationFeeds: boolean;
  hasSecurityAdvisories: boolean;
  hasRepositoryDiscussions: boolean;
  totalFeedTypes: number;
  feedTypes: string[];
}

/**
 * Feeds API endpoints
 */
export class FeedsAPI {
  http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * Get feeds
   * Lists the feeds available to the authenticated user
   */
  async getFeeds(): Promise<Feed> {
    const response = await this.http.get<Feed>('/feeds');
    return response.data as unknown as Feed;
  }

  /**
   * Get timeline feed URL
   */
  async getTimelineFeedUrl(): Promise<string> {
    const feeds = await this.getFeeds();
    return feeds.timeline_url;
  }

  /**
   * Get user feed URL template
   */
  async getUserFeedUrl(): Promise<string> {
    const feeds = await this.getFeeds();
    return feeds.user_url;
  }

  /**
   * Get current user public feed URL
   */
  async getCurrentUserPublicFeedUrl(): Promise<string | undefined> {
    const feeds = await this.getFeeds();
    return feeds.current_user_public_url;
  }

  /**
   * Get current user feed URL (private)
   */
  async getCurrentUserFeedUrl(): Promise<string | undefined> {
    const feeds = await this.getFeeds();
    return feeds.current_user_url;
  }

  /**
   * Get current user actor feed URL
   */
  async getCurrentUserActorFeedUrl(): Promise<string | undefined> {
    const feeds = await this.getFeeds();
    return feeds.current_user_actor_url;
  }

  /**
   * Get current user organization feed URLs
   */
  async getCurrentUserOrganizationFeedUrls(): Promise<string[]> {
    const feeds = await this.getFeeds();
    return feeds.current_user_organization_urls || [];
  }

  /**
   * Get security advisories feed URL
   */
  async getSecurityAdvisoriesFeedUrl(): Promise<string> {
    const feeds = await this.getFeeds();
    return feeds.security_advisories_url;
  }

  /**
   * Get repository discussions feed URL template
   */
  async getRepositoryDiscussionsFeedUrl(): Promise<string | undefined> {
    const feeds = await this.getFeeds();
    return feeds.repository_discussions_url;
  }

  /**
   * Get repository discussions category feed URL template
   */
  async getRepositoryDiscussionsCategoryFeedUrl(): Promise<string | undefined> {
    const feeds = await this.getFeeds();
    return feeds.repository_discussions_category_url;
  }

  /**
   * Get all feed links
   */
  async getAllFeedLinks(): Promise<object> {
    const feeds = await this.getFeeds();
    return feeds._links;
  }

  /**
   * Generate user feed URL for a specific user
   */
  async generateUserFeedUrl(username: string): Promise<string> {
    const template = await this.getUserFeedUrl();
    return template.replace('{user}', username);
  }

  /**
   * Generate repository discussions feed URL
   */
  async generateRepositoryDiscussionsFeedUrl(owner: string, repo: string): Promise<string> {
    const template = await this.getRepositoryDiscussionsFeedUrl();
    return (template as string).replace('{user}', owner).replace('{repo}', repo);
  }

  /**
   * Generate repository discussions category feed URL
   */
  async generateRepositoryDiscussionsCategoryFeedUrl(
    owner: string,
    repo: string,
    category: string
  ): Promise<string> {
    const template = await this.getRepositoryDiscussionsCategoryFeedUrl();
    return (template as string)
      .replace('{user}', owner)
      .replace('{repo}', repo)
      .replace('{category}', category);
  }

  /**
   * Check if authenticated user has private feeds
   */
  async hasPrivateFeeds(): Promise<boolean> {
    const feeds = await this.getFeeds();
    return !!(feeds.current_user_url && feeds.current_user_actor_url);
  }

  /**
   * Get feed metadata
   */
  async getFeedMetadata(): Promise<FeedMetadata> {
    const feeds = await this.getFeeds();
    const links = feeds._links || {};

    return {
      hasTimeline: !!feeds.timeline_url,
      hasUserFeed: !!feeds.user_url,
      hasCurrentUserPublic: !!feeds.current_user_public_url,
      hasCurrentUserPrivate: !!feeds.current_user_url,
      hasCurrentUserActor: !!feeds.current_user_actor_url,
      hasOrganizationFeeds: (feeds.current_user_organization_urls || []).length > 0,
      hasSecurityAdvisories: !!feeds.security_advisories_url,
      hasRepositoryDiscussions: !!feeds.repository_discussions_url,
      totalFeedTypes: Object.keys(links).length,
      feedTypes: Object.keys(links)
    };
  }

  /**
   * Get all available feed URLs
   */
  async getAllAvailableFeeds(): Promise<AvailableFeed[]> {
    const feeds = await this.getFeeds();
    const availableFeeds: AvailableFeed[] = [];

    if (feeds.timeline_url) {
      availableFeeds.push({
        name: 'Timeline',
        type: 'timeline',
        url: feeds.timeline_url,
        public: true
      });
    }

    if (feeds.current_user_public_url) {
      availableFeeds.push({
        name: 'Current User (Public)',
        type: 'current_user_public',
        url: feeds.current_user_public_url,
        public: true
      });
    }

    if (feeds.current_user_url) {
      availableFeeds.push({
        name: 'Current User (Private)',
        type: 'current_user',
        url: feeds.current_user_url,
        public: false
      });
    }

    if (feeds.current_user_actor_url) {
      availableFeeds.push({
        name: 'Current User Actor',
        type: 'current_user_actor',
        url: feeds.current_user_actor_url,
        public: false
      });
    }

    if (feeds.security_advisories_url) {
      availableFeeds.push({
        name: 'Security Advisories',
        type: 'security_advisories',
        url: feeds.security_advisories_url,
        public: true
      });
    }

    if (feeds.current_user_organization_urls) {
      feeds.current_user_organization_urls.forEach((url, index) => {
        availableFeeds.push({
          name: `Organization Feed ${index + 1}`,
          type: 'organization',
          url: url,
          public: false
        });
      });
    }

    return availableFeeds;
  }
}

export default FeedsAPI;
