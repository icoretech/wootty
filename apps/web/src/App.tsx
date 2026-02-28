import {
  TerminalApp,
  type TerminalAppEnvironment,
} from "./features/terminal/app/TerminalApp";

type AppProps = {
  environment?: TerminalAppEnvironment;
};

export default function App({ environment }: AppProps = {}) {
  return <TerminalApp environment={environment} />;
}
