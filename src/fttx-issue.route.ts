import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { OkPacket, RowDataPacket } from "mysql2";

interface RequestBody {
  subject: string;
  effect: string;
  startTime: string;
  operator: string;
  operators: string[];
  branch: string;
  pop: string;
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
        const {
          subject,
          effect,
          startTime,
          operator,
          operators,
          branch,
          pop,
          cids,
        } = req.body;

        const [result] = await connection.query<SQLResult>(
          `
        INSERT INTO noc (
          start_time,
          end_time,
          subject,
          status,
          cause,
          effect,
          eksternal,
          branchId,
          employee_id,
          datetime,
          fo_vendor_id,
          fiber_vendor_id,
          effected_customer,
          type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?)`,
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
            operator,
            pop,
            DEFAULT_ISSUE_EFFECT,
            FTTX_TYPE,
          ]
        );

        const insertId = result.insertId;

        const operatorsPlaceHolder = new Array(operators.length)
          .fill("?")
          .join(", ");
        const cidsPlaceHolder = new Array(cids.length).fill("?").join(", ");

        const [rows] = await connection.query<Row[]>(
          `
        SELECT cstc.value cid, cs.CustServId csid, cs.CustAccName acc, e.EmpHP hp
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

        const promises = rows.map((row) => {
          const { cid, csid, acc, hp } = row;

          notification[hp] = notification[hp] ?? [];
          notification[hp].push({ csid, acc });

          subscription[cid] = subscription[cid] ?? [];
          subscription[cid].push({ csid, acc });

          return connection.query(
            "INSERT INTO noc_customer_service (noc_id, cs_id) VALUES (?, ?)",
            [insertId, csid]
          );
        });

        await Promise.all(promises);

        reply.send({ data: subscription });
      } catch (error) {
        console.error(error);
        reply.code(500).send({ error: "Database operation failed." });
      } finally {
        connection.release();
      }
    }
  );
};
