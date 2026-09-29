import * as React from "react";
import {
    Html,
    Head,
    Preview,
    Body,
    Container,
    Section,
    Text,
    Button,
    Hr,
} from "@react-email/components";

interface InvitationEmailProps {
  inviteUrl: string;
  organizationName: string;
  inviterName: string;
  roleName: string;
  recipientEmail: string;
}

export function InvitationEmailTemplate({
  inviteUrl,
  organizationName,
  inviterName,
  roleName,
  recipientEmail,
}: InvitationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {inviterName} vous invite à rejoindre {organizationName} sur Evoly
      </Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={logoSection}>
            <Text style={logoText}>evoly</Text>
          </Section>
          <Section style={content}>
            <Text style={heading}>
              Vous avez été invité à rejoindre {organizationName}
            </Text>
            <Text style={paragraph}>
              {inviterName} vous invite à rejoindre{" "}
              <strong>{organizationName}</strong> sur Evoly en tant que{" "}
              <strong>{roleName}</strong>.
            </Text>
            <Button href={inviteUrl} style={button}>
              Accepter l&apos;invitation
            </Button>
            <Text style={smallText}>
              Cette invitation expire dans 48 heures. Elle a été envoyée à{" "}
              {recipientEmail}. Si vous ne connaissez pas {inviterName}, vous
              pouvez ignorer cet email.
            </Text>
          </Section>
          <Hr style={hr} />
          <Section>
            <Text style={footer}>© 2025 Evoly. Fait avec ♥ en Belgique.</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const container: React.CSSProperties = {
  margin: "0 auto",
  padding: "40px 20px",
  maxWidth: "560px",
};

const logoSection: React.CSSProperties = {
  textAlign: "center",
  marginBottom: "32px",
};

const logoText: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: "700",
  color: "#7c3aed",
  letterSpacing: "-0.5px",
};

const content: React.CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  padding: "40px",
  border: "1px solid #e5e7eb",
};

const heading: React.CSSProperties = {
  fontSize: "22px",
  fontWeight: "700",
  color: "#111827",
  marginBottom: "16px",
};

const paragraph: React.CSSProperties = {
  fontSize: "15px",
  color: "#374151",
  lineHeight: "1.6",
  marginBottom: "24px",
};

const button: React.CSSProperties = {
  backgroundColor: "#7c3aed",
  color: "#ffffff",
  padding: "12px 24px",
  borderRadius: "8px",
  fontWeight: "600",
  fontSize: "15px",
  display: "inline-block",
  textDecoration: "none",
};

const smallText: React.CSSProperties = {
  fontSize: "13px",
  color: "#6b7280",
  marginTop: "24px",
  lineHeight: "1.5",
};

const hr: React.CSSProperties = {
  borderColor: "#e5e7eb",
  margin: "24px 0",
};

const footer: React.CSSProperties = {
  fontSize: "13px",
  color: "#9ca3af",
  textAlign: "center",
};
