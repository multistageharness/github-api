/**
 * Comments management command
 */

import ora from 'ora';
import inquirer from 'inquirer';
import { formatComment, formatSuccess, formatWarning } from '../utils/format.js';
import type { CommentLike } from '../utils/format.js';
import type { IssuesClient } from '../lib/client.js';
import type { Command, CommandOptions } from './types.js';

const command: Command = {
  async execute(client: IssuesClient, options: CommandOptions): Promise<void> {
    const action = options.action?.toLowerCase();

    switch (action) {
      case 'list':
      case 'ls':
        await listComments(client, options);
        break;

      case 'add':
      case 'create':
        await addComment(client, options);
        break;

      case 'edit':
      case 'update':
        await editComment(client, options);
        break;

      case 'delete':
      case 'remove':
        await deleteComment(client, options);
        break;

      default:
        throw new Error(`Unknown action: ${action}. Use: list, add, edit, delete`);
    }
  }
};

async function listComments(client: IssuesClient, options: CommandOptions): Promise<void> {
  if (!options.number) {
    throw new Error('Issue number is required. Use -n <number>');
  }

  const spinner = ora(`Fetching comments for issue #${options.number}...`).start();

  try {
    const comments = (await client.listComments(options.number, {
      since: options.since
    })) as CommentLike[];

    spinner.succeed(`Found ${comments.length} comments`);

    if (comments.length === 0) {
      console.log(formatWarning('No comments found'));
      return;
    }

    comments.forEach((comment, index) => {
      console.log(`\n#${(comment as { id?: number }).id} ${formatComment(comment)}`);
      if (index < comments.length - 1) {
        console.log('---');
      }
    });
  } catch (error) {
    spinner.fail();
    throw error;
  }
}

async function addComment(client: IssuesClient, options: CommandOptions): Promise<void> {
  if (!options.number) {
    throw new Error('Issue number is required. Use -n <number>');
  }

  let body = options.body;

  if (!body) {
    const answer = await inquirer.prompt({
      type: 'editor',
      name: 'body',
      message: 'Enter comment:',
      validate: (input: string) => input.trim() !== '' || 'Comment cannot be empty'
    });
    body = answer['body'] as string;
  }

  const spinner = ora('Adding comment...').start();

  try {
    const comment = (await client.createComment(options.number, body)) as CommentLike & {
      id?: number;
    };
    spinner.succeed(formatSuccess(`Comment #${comment.id} added`));
    console.log(formatComment(comment));
  } catch (error) {
    spinner.fail();
    throw error;
  }
}

async function editComment(client: IssuesClient, options: CommandOptions): Promise<void> {
  if (!options.comment) {
    throw new Error('Comment ID is required. Use -c <id>');
  }

  let body = options.body;

  if (!body) {
    // Fetch current comment
    const spinner = ora('Fetching comment...').start();
    try {
      const current = (await client.getComment(options.comment)) as CommentLike;
      spinner.stop();

      const answer = await inquirer.prompt({
        type: 'editor',
        name: 'body',
        message: 'Edit comment:',
        default: current.body,
        validate: (input: string) => input.trim() !== '' || 'Comment cannot be empty'
      });
      body = answer['body'] as string;
    } catch (error) {
      spinner.fail();
      throw error;
    }
  }

  const updateSpinner = ora('Updating comment...').start();

  try {
    const comment = (await client.updateComment(options.comment, body)) as CommentLike & {
      id?: number;
    };
    updateSpinner.succeed(formatSuccess(`Comment #${comment.id} updated`));
    console.log(formatComment(comment));
  } catch (error) {
    updateSpinner.fail();
    throw error;
  }
}

async function deleteComment(client: IssuesClient, options: CommandOptions): Promise<void> {
  if (!options.comment) {
    throw new Error('Comment ID is required. Use -c <id>');
  }

  const confirm = await inquirer.prompt({
    type: 'confirm',
    name: 'delete',
    message: `Are you sure you want to delete comment #${options.comment}?`,
    default: false
  });

  if (!confirm['delete']) {
    console.log('Cancelled');
    return;
  }

  const spinner = ora('Deleting comment...').start();

  try {
    await client.deleteComment(options.comment);
    spinner.succeed(formatSuccess(`Comment #${options.comment} deleted`));
  } catch (error) {
    spinner.fail();
    throw error;
  }
}

export default command;
