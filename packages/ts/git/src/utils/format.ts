/**
 * @fileoverview Output formatting for the GitHub Git CLI
 * @module utils/format
 */

/** Person record (author / committer / tagger) shape used when pretty-printing. */
interface PersonLike {
  name?: string;
  email?: string;
  date?: string;
}

/** Git object reference shape used when pretty-printing. */
interface ObjectLike {
  type?: string;
  sha?: string;
}

/** Verification block shape used when pretty-printing. */
interface VerificationLike {
  verified?: boolean;
  reason?: string;
}

/**
 * Loosely-typed view of an API result for pretty-printing. The GitHub Git API
 * returns dynamically-shaped payloads per endpoint, so each field is optional
 * and read defensively.
 */
interface FormattableData {
  sha?: unknown;
  url?: unknown;
  ref?: unknown;
  tag?: unknown;
  message?: unknown;
  author?: PersonLike;
  committer?: PersonLike;
  tagger?: PersonLike;
  object?: ObjectLike;
  tree?: { sha?: unknown } | unknown[];
  parents?: Array<{ sha?: unknown }>;
  verification?: VerificationLike;
  content?: unknown;
  encoding?: unknown;
}

/**
 * Format and print API output, either as JSON or as a pretty-printed summary.
 */
// Endpoint payloads are dynamically shaped per GitHub Git API endpoint.
export function formatOutput(data: unknown, asJson = false): void {
  if (asJson) {
    console.log(JSON.stringify(data, null, 2));
  } else if (data) {
    const d = data as FormattableData;

    // Pretty print based on data type
    if (d.sha) {
      console.log(`SHA: ${d.sha}`);
    }

    if (d.url) {
      console.log(`URL: ${d.url}`);
    }

    if (d.ref) {
      console.log(`Ref: ${d.ref}`);
    }

    if (d.tag) {
      console.log(`Tag: ${d.tag}`);
    }

    if (d.message) {
      console.log(`Message: ${d.message}`);
    }

    if (d.author) {
      console.log('\nAuthor:');
      console.log(`  Name: ${d.author.name}`);
      console.log(`  Email: ${d.author.email}`);
      console.log(`  Date: ${d.author.date}`);
    }

    if (d.committer) {
      console.log('\nCommitter:');
      console.log(`  Name: ${d.committer.name}`);
      console.log(`  Email: ${d.committer.email}`);
      console.log(`  Date: ${d.committer.date}`);
    }

    if (d.tagger) {
      console.log('\nTagger:');
      console.log(`  Name: ${d.tagger.name}`);
      console.log(`  Email: ${d.tagger.email}`);
      console.log(`  Date: ${d.tagger.date}`);
    }

    if (d.object) {
      console.log('\nObject:');
      console.log(`  Type: ${d.object.type}`);
      console.log(`  SHA: ${d.object.sha}`);
    }

    if (d.tree) {
      if (!Array.isArray(d.tree) && d.tree.sha) {
        console.log(`Tree SHA: ${d.tree.sha}`);
      } else if (Array.isArray(d.tree)) {
        console.log(`Tree entries: ${d.tree.length}`);
      }
    }

    if (d.parents && Array.isArray(d.parents)) {
      console.log(`Parents: ${d.parents.map((p) => p.sha).join(', ')}`);
    }

    if (d.verification) {
      console.log('\nVerification:');
      console.log(`  Verified: ${d.verification.verified}`);
      console.log(`  Reason: ${d.verification.reason}`);
    }

    if (d.content !== undefined && d.encoding) {
      console.log(`\nContent (${d.encoding}):`);
      if (d.encoding === 'base64') {
        console.log(String(d.content).substring(0, 100) + '...');
      } else {
        console.log(String(d.content));
      }
    }
  }
}
