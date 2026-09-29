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
    Hr
} from "@react-email/components";

interface VerifyEmailProps {
  verificationUrl: string;
  userName?: string;
}

export function VerifyEmailTemplate({
  verificationUrl,
  userName,
}: VerifyEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Vérifiez votre adresse email pour Evoly</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={logoSection}>
            <Text style={logoText}>evoly</Text>
          </Section>
          <Section style={content}>
            <Text style={heading}>Vérifiez votre email</Text>
            <Text style={paragraph}>
              {userName ? `Bonjour ${userName},` : "Bonjour,"}{" "}
              Merci de vous être inscrit sur Evoly. Cliquez sur le bouton
              ci-dessous pour vérifier votre adresse email.
            </Text>
            <Button href={verificationUrl} style={button}>
              Vérifier mon email
            </Button>
            <Text style={smallText}>
              Ce lien expire dans 24 heures. Si vous n&apos;avez pas créé de
              compte, vous pouvez ignorer cet email.
            </Text>
          </Section>
          <Hr style={hr} />
          <Section>
            <Text style={footer}>
              © 2025 Evoly. Fait avec ♥ en Belgique.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
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
