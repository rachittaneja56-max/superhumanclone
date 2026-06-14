import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | Aethra',
  description: 'Privacy Policy for Aethra AI Email Client',
};

export default function PrivacyPolicy() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-20 font-sans text-foreground">
      <h1 className="font-display text-4xl font-bold tracking-tight mb-8">Privacy Policy</h1>
      
      <div className="prose prose-lg dark:prose-invert">
        <p className="text-muted-foreground mb-8">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

        <h2 className="text-2xl font-semibold mt-10 mb-4">What Aethra Collects</h2>
        <ul className="list-disc pl-6 space-y-2 mb-8">
          <li><strong>Google account info:</strong> Name, email, and profile picture via Google OAuth.</li>
          <li><strong>Email metadata:</strong> Sender address, subject line, date received, and a short text snippet.</li>
          <li><strong>Calendar event metadata:</strong> Title, start time, end time, and attendee list.</li>
          <li><strong>Your privacy consent settings:</strong> Which domain configurations AI is allowed to process.</li>
        </ul>

        <h2 className="text-2xl font-semibold mt-10 mb-4">What Aethra Does NOT Do</h2>
        <ul className="list-disc pl-6 space-y-2 mb-8">
          <li><strong>We never sell your data</strong> to any third parties.</li>
          <li><strong>We never use your emails to train AI models</strong> (Zero Data Retention API policies are strictly enforced).</li>
          <li><strong>We never share email content</strong> with third parties for advertising or marketing.</li>
          <li><strong>We never store your Google OAuth tokens</strong> directly on our servers (managed securely by Corsair).</li>
        </ul>

        <h2 className="text-2xl font-semibold mt-10 mb-4">How AI Processing Works</h2>
        <ul className="list-disc pl-6 space-y-2 mb-8">
          <li>You explicitly choose which email domains AI can access via our <strong>Privacy Gate</strong>.</li>
          <li>Emails from protected domains are actively filtered out and <strong>never sent</strong> to AI providers.</li>
          <li>AI providers used: Google Gemini (for fast categorization) and OpenAI (for complex processing in production).</li>
          <li>You can disable all AI processing at any time directly in your Settings.</li>
        </ul>

        <h2 className="text-2xl font-semibold mt-10 mb-4">Data Retention & Deletion</h2>
        <ul className="list-disc pl-6 space-y-2 mb-8">
          <li>Email body content is <strong>purged after 30 days</strong> (only basic metadata is retained).</li>
          <li>Deleted emails are permanently removed from our databases within 10 minutes.</li>
          <li>You can request a full account deletion and complete data wipe by contacting us.</li>
        </ul>

        <h2 className="text-2xl font-semibold mt-10 mb-4">Contact</h2>
        <p>
          If you have any questions or concerns about your data, please contact us via our GitHub repository or at privacy@aethra.app.
        </p>
      </div>
    </div>
  );
}
