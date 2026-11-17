import { db } from "../src/database/database";
import {
  forgetPreference,
  revisePreference,
  learnPreference
} from "../src/novaCore/memory/learnPreference";

try {
  const args = process.argv.slice(2);
  if (args[0] === "forget" && args.length === 2) {
    console.log(JSON.stringify({ forgotten: forgetPreference(args[1]) }));
  } else if (args[0] === "revise" && args.length === 5) {
    console.log(
      JSON.stringify({
        revised: await revisePreference(args[1], args[2], [
          Number(args[3]),
          Number(args[4])
        ])
      })
    );
  } else if (args.length === 3) {
    console.log(
      JSON.stringify({
        created: await learnPreference(args[0], [
          Number(args[1]),
          Number(args[2])
        ])
      })
    );
  } else {
    throw new Error(
      'Expected "topic" <episodeId> <episodeId>, revise "old" "new" <episodeId> <episodeId>, or forget "topic".'
    );
  }
} finally {
  db.close();
}
