import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { OkPacket, RowDataPacket } from "mysql2";

interface RequestBody {
  subject: string;
  effect: string;
  startTime: string;
  operators: string[];
  branch: string;
  cids: string[];
}

interface SQLResult extends OkPacket {
  insertId: number;
}

interface Row extends RowDataPacket {
  cid: string;
  csid: string;
  acc: string;
  hp: string;
}

const DEFAULT_ISSUE_STATUS = "Open";
const DEFAULT_ISSUE_CAUSE = "under investigate";
const DEFAULT_ISSUE_EMPLOYEE = "0200306";
const DEFAULT_ISSUE_EFFECT = "Ya";
const CID_ATTRIBUTE = "Vendor CID";
const FTTX_TYPE = "fttx";

export const fttxIssueRoute = async (fastify: FastifyInstance) => {
  fastify.post(
    "/",
    async (req: FastifyRequest<{ Body: RequestBody }>, reply: FastifyReply) => {
      const connection = await fastify.mysql.getConnection();

      try {
        const { subject, effect, startTime, operators, branch, cids } =
          req.body;

        const operatorsPlaceHolder = new Array(operators.length)
          .fill("?")
          .join(", ");
        const cidsPlaceHolder = new Array(cids.length).fill("?").join(", ");

        const [rows] = await connection.query<Row[]>(
          `
        SELECT cstc.value cid, cs.CustServId csid, cs.CustAccName acc, e.EmpHP hp, nf.id pop, e.EmpJoinStatus status
        FROM CustomerServiceTechnicalCustom cstc
        LEFT JOIN CustomerServiceTechnicalLink cstl ON cstc.technicalTypeId = cstl.id
        LEFT JOIN noc_fiber nf ON cstl.foVendorId = nf.id
        LEFT JOIN CustomerServices cs ON cstl.CustServId = cs.custServId
        LEFT JOIN fiber_vendor fv ON nf.vendorId =  fv.id
        LEFT JOIN Customer c ON cs.CustId = c.CustId
        LEFT JOIN Employee e ON e.EmpId = c.SalesId
        WHERE cstc.attribute = ?
          AND fv.id IN (${operatorsPlaceHolder})
          AND cstc.value IN (${cidsPlaceHolder})`,
          [CID_ATTRIBUTE, ...operators, ...cids]
        );

        const notification: Record<string, any[]> = {};
        const subscription: Record<string, any[]> = {};
        const pops: any[] = [];
        const csids: any[] = [];

        for (const { cid, csid, acc, hp, pop, status } of rows) {
          if (hp && status != "QUIT") {
            notification[hp] = notification[hp] ?? [];
            notification[hp].push({ csid, acc });
          }

          subscription[cid] = subscription[cid] ?? [];
          subscription[cid].push({ csid, acc });
          if (!pops.includes(pop)) {
            pops.push(pop);
          }
          if (!csids.includes(csid)) {
            csids.push(csid);
          }
        }

        const [result] = await connection.query<SQLResult>(
          `INSERT INTO noc SET
             start_time = ?,
             end_time = ?,
             subject = ?,
             status = ?,
             cause = ?,
             effect = ?,
             eksternal = ?,
             branchId = ?,
             employee_id = ?,
             datetime = NOW(),
             fiber_vendor_id = ?,
             fo_vendor_id = ?,
             effected_customer = ?,
             type = ?`,
          [
            startTime,
            startTime,
            subject,
            DEFAULT_ISSUE_STATUS,
            DEFAULT_ISSUE_CAUSE,
            effect,
            effect,
            branch,
            DEFAULT_ISSUE_EMPLOYEE,
            `,${operators.join(",")},`,
            `,${pops.join(",")},`,
            DEFAULT_ISSUE_EFFECT,
            FTTX_TYPE,
          ]
        );

        const insertId = result.insertId;

        const promises = csids.map((csid) => {
          return connection.query(
            "INSERT INTO noc_customer_service (noc_id, cs_id) VALUES (?, ?)",
            [insertId, csid]
          );
        });

        for (const hp in notification) {
          const notificationLines = [
            `${process.env.NOTIFICATION_PREFIX} - ${subject}`,
          ];
          notificationLines.push("Customer terdampak:");
          for (const { csid, acc } of notification[hp]) {
            const subsriptionLink = `https://isx.nusa.net.id/v2/customer/service/${csid}/detail`;
            notificationLines.push(`${acc} - ${subsriptionLink}`);
          }
          sendNotification(hp, notificationLines.join("\n"));
        }

        await Promise.all(promises);

        reply.send({ data: subscription });
      } catch (error) {
        fastify.log.error(error);
        reply.code(500).send({ error: "Database operation failed." });
      } finally {
        connection.release();
      }
    }
  );
};

async function sendNotification(destination: string, message: string) {
  const headers = {
    "Content-Type": "application/json",
    "X-Api-Key": process.env.NOTIFICATION_API_KEY!,
  };
  const body = {
    to: destination,
    type: "text",
    msg: message,
  };

  fetch(process.env.NOTIFICATION_API_URL!, {
    method: "POST",
    headers: headers,
    body: JSON.stringify(body),
  });
}
