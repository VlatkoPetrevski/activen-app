import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../../api/ApiContext.js";
import { useMe } from "../../auth/AuthContext.js";
import { useI18n } from "../../i18n/I18nContext.js";
import { Thread } from "../../training/Thread.js";
import { QueryView } from "../../ui/States.js";

/** The coach's side of the conversation with one athlete, with quick recommendations. */
export function CoachThread({ athleteId }: { athleteId: string }) {
  const api = useApi();
  const me = useMe();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["athlete", athleteId, "comments"],
    queryFn: () => api.athleteComments(athleteId),
  });
  return (
    <QueryView query={query}>
      {(list) => (
        <Thread
          comments={list}
          myId={me.user.id}
          quickReplies={[
            t("coachApp.quick.keep"),
            t("coachApp.quick.easier"),
            t("coachApp.quick.rest"),
          ]}
          onSend={async (body) => {
            await api.postAthleteComment(athleteId, { body });
            await queryClient.invalidateQueries({ queryKey: ["athlete", athleteId, "comments"] });
            await queryClient.invalidateQueries({ queryKey: ["coach"] });
          }}
        />
      )}
    </QueryView>
  );
}
