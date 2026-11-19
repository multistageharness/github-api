/**
 * Get issue command
 */

import ora from 'ora';
import { formatIssue, formatComment, formatError } from '../utils/format.js';
import type { IssueLike, CommentLike } from '../utils/format.js';
import type { IssuesClient } from '../lib/client.js';
import type { Command, CommandOptions } from './types.js';

/** Minimal event shape accessed by the get command. */
interface EventLike {
  event?: string;
  type?: string;
  actor?: { login?: string };
  user?: { login?: string };
  created_at: string;
}

const command: Command = {
  async execute(client: IssuesClient, options: CommandOptions): Promise<void> {
    const spinner = ora(`Fetching issue #${options.number}...`).start();

    try {
      // Get issue details
      const issue = (await client.get(options.number as number)) as IssueLike;
      spinner.succeed(`Found issue #${issue.number}`);

      // Display issue
      console.log(formatIssue(issue, options.output || 'text'));

      // Fetch and display comments if requested
      if (options.comments && issue.comments > 0) {
        const commentsSpinner = ora('Fetching comments...').start();
        try {
          const comments = (await client.listComments(options.number as number)) as CommentLike[];
          commentsSpinner.succeed(`Fetched ${comments.length} comments`);

          console.log('\n--- Comments ---\n');
          comments.forEach((comment, index) => {
            console.log(`#${index + 1} ${formatComment(comment)}`);
            if (index < comments.length - 1) {
              console.log('---');
            }
          });
        } catch (error) {
          commentsSpinner.fail('Failed to fetch comments');
          console.error(formatError(error as Error));
        }
      }

      // Fetch and display events if requested
      if (options.events) {
        const eventsSpinner = ora('Fetching events...').start();
        try {
          const events = (await client.listEvents(options.number as number)) as EventLike[];
          eventsSpinner.succeed(`Fetched ${events.length} events`);

          console.log('\n--- Events ---\n');
          events.forEach((event) => {
            console.log(
              `• ${event.event} by @${event.actor?.login || 'unknown'} at ${new Date(event.created_at).toLocaleString()}`
            );
          });
        } catch (error) {
          eventsSpinner.fail('Failed to fetch events');
          console.error(formatError(error as Error));
        }
      }

      // Fetch and display timeline if requested
      if (options.timeline) {
        const timelineSpinner = ora('Fetching timeline...').start();
        try {
          const timeline = (await client.listTimelineEvents(
            options.number as number
          )) as EventLike[];
          timelineSpinner.succeed(`Fetched ${timeline.length} timeline events`);

          console.log('\n--- Timeline ---\n');
          timeline.forEach((event) => {
            const actor = event.actor?.login || event.user?.login || 'unknown';
            console.log(
              `• ${event.event || event.type} by @${actor} at ${new Date(event.created_at).toLocaleString()}`
            );
          });
        } catch (error) {
          timelineSpinner.fail('Failed to fetch timeline');
          console.error(formatError(error as Error));
        }
      }
    } catch (error) {
      spinner.fail();
      throw error;
    }
  }
};

export default command;
