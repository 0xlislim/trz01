import readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";

export const prompt = (question) => {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input, output });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
};

export const promptHidden = (question) => {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input, output, terminal: true });
    const write = rl._writeToOutput.bind(rl);
    output.write(question);
    rl._writeToOutput = () => {};
    rl.question("", (answer) => {
      rl._writeToOutput = write;
      rl.close();
      output.write("\n");
      resolve(answer);
    });
  });
};
