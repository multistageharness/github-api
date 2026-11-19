/**
 * Labels management command
 */

import ora from 'ora';
import { formatLabel, formatSuccess } from '../utils/format.js';
import type { LabelObject } from '../utils/format.js';
import type { IssuesClient } from '../lib/client.js';
import type { Command, CommandOptions } from './types.js';

const command: Command = {
  async execute(client: IssuesClient, options: CommandOptions): Promise<void> {
    const action = options.action?.toLowerCase();

    switch (action) {
      case 'list':
        await listLabels(client, options);
        break;

      case 'add':
        await addLabels(client, options);
        break;

      case 'remove':
        await removeLabel(client, options);
        break;

      case 'set':
        await setLabels(client, options);
        break;

      default:
        throw new Error(`Unknown action: ${action}. Use: list, add, remove, set`);
    }
  }
};

async function listLabels(client: IssuesClient, options: CommandOptions): Promise<void> {
  const spinner = ora('Fetching labels...').start();

  try {
    let labels: LabelObject[];

    if (options.number) {
      labels = (await client.listLabelsOnIssue(options.number)) as LabelObject[];
      spinner.succeed(`Found ${labels.length} labels on issue #${options.number}`);
    } else {
      labels = (await client.listLabelsForRepo()) as LabelObject[];
      spinner.succeed(`Found ${labels.length} repository labels`);
    }

    labels.forEach((label) => {
      console.log(formatLabel(label));
    });
  } catch (error) {
    spinner.fail();
    throw error;
  }
}

async function addLabels(client: IssuesClient, options: CommandOptions): Promise<void> {
  if (!options.number || !options.labels) {
    throw new Error('Issue number and labels are required');
  }

  const labels = options.labels
    .split(',')
    .map((l) => l.trim())
    .filter((l) => l);
  const spinner = ora('Adding labels...').start();

  try {
    const updated = (await client.addLabels(options.number, labels)) as LabelObject[];
    spinner.succeed(formatSuccess(`Labels added to issue #${options.number}`));
    updated.forEach((label) => console.log(formatLabel(label)));
  } catch (error) {
    spinner.fail();
    throw error;
  }
}

async function removeLabel(client: IssuesClient, options: CommandOptions): Promise<void> {
  if (!options.number || !options.name) {
    throw new Error('Issue number and label name are required');
  }

  const spinner = ora('Removing label...').start();

  try {
    await client.removeLabel(options.number, options.name);
    spinner.succeed(
      formatSuccess(`Label "${options.name}" removed from issue #${options.number}`)
    );
  } catch (error) {
    spinner.fail();
    throw error;
  }
}

async function setLabels(client: IssuesClient, options: CommandOptions): Promise<void> {
  if (!options.number || !options.labels) {
    throw new Error('Issue number and labels are required');
  }

  const labels = options.labels
    ? options.labels
        .split(',')
        .map((l) => l.trim())
        .filter((l) => l)
    : [];
  const spinner = ora('Setting labels...').start();

  try {
    const updated = (await client.setLabels(options.number, labels)) as LabelObject[];
    spinner.succeed(formatSuccess(`Labels set on issue #${options.number}`));
    updated.forEach((label) => console.log(formatLabel(label)));
  } catch (error) {
    spinner.fail();
    throw error;
  }
}

export default command;
